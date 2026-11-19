import assert from 'node:assert/strict';
import test from 'node:test';
import { createMockSupabaseClient } from '../src/lib/supabase';
import { workshopDate } from '../src/lib/operations';

type DemoClient = ReturnType<typeof createMockSupabaseClient>;
const owner = 'mock-user-1';
async function fixture(stock = 2) {
  const db = createMockSupabaseClient();
  const itemId = crypto.randomUUID();
  const orderId = 'OS-99201';
  await db.from('inventario').insert({ id: itemId, sku: 'SDD-PART', nombre: 'Puerto USB-C', categoria: 'Flex y Puertos', stock_actual: stock, costo_compra: 30, precio_venta: 100 });
  await db.from('ordenes').insert({ id: orderId, estado: 'En Reparación', dispositivo_modelo: 'Galaxy S22', costo_mano_obra: 200, total_estimado: 200, repuestos_asignados: [], garantia_dias: 90 });
  return { db, itemId, orderId };
}
const command = (db: DemoClient, value: Record<string, unknown>, id = crypto.randomUUID()) => db.rpc('apply_offline_operation', { p_operation_id: id, p_owner_id: owner, p_command: value });
async function row(db: DemoClient, table: string, id: string) {
  const result = await db.from(table).select('*').eq('id', id).single();
  assert.equal(result.error, null);
  return result.data;
}

test('assignment atomically snapshots server price/cost, consumes stock and publishes the exact Kardex entry once', async () => {
  const { db, itemId, orderId } = await fixture();
  const partId = crypto.randomUUID();
  const args = { kind: 'assignPart', orderId, itemId, part: { id: partId, sku: 'SDD-PART', cantidad: 2, precioUnitario: 1, nombre: 'Untrusted name' } };
  const operationId = crypto.randomUUID();
  const updates: string[] = [];
  const channel = db.channel('sdd-kardex').on('postgres_changes', { schema: 'public', table: 'movimientos_inventario', event: 'INSERT' }, () => updates.push('movement')).subscribe();
  const first = await command(db, args, operationId);
  assert.equal(first.error, null);
  assert.equal(first.data.orders[0].total_estimado, 400);
  assert.equal(first.data.orders[0].repuestos_asignados[0].precioUnitario, 100);
  assert.equal(first.data.inventory[0].stock_actual, 0);
  const movement = first.data.movements[0];
  assert.equal(movement.id, partId);
  assert.equal(movement.repuesto_id, itemId);
  assert.equal(movement.codigo_orden, orderId);
  assert.equal(movement.tipo, 'salida');
  assert.equal(movement.cantidad, -2);
  assert.equal(movement.costo_unitario, 30);
  assert.equal(movement.motivo, 'Asignado a orden OS-99201 (Galaxy S22)');
  const retry = await command(db, args, operationId);
  assert.equal(retry.data.replayed, true);
  assert.deepEqual(retry.data.movements, first.data.movements);
  assert.equal((await db.from('movimientos_inventario').select('*').eq('codigo_orden', orderId)).data.length, 1);
  assert.equal(updates.length, 1);
  await db.from('inventario').update({ costo_compra: 900 }).eq('id', itemId);
  assert.equal((await db.rpc('resumen_caja', { p_fecha: workshopDate() })).data.gastos_repuestos, 60);
  await db.removeChannel(channel);
});

test('two devices competing for the last part produce one assignment and one clear out-of-stock error', async () => {
  const { db, itemId, orderId } = await fixture(1);
  const secondOrder = 'OS-99202';
  await db.from('ordenes').insert({ id: secondOrder, estado: 'En Diagnóstico', total_estimado: 0, costo_mano_obra: 0 });
  const results = await Promise.all([orderId, secondOrder].map((id) => command(db, { kind: 'assignPart', orderId: id, itemId, part: { id: crypto.randomUUID(), sku: 'SDD-PART', cantidad: 1 } })));
  assert.equal(results.filter((result) => !result.error).length, 1);
  assert.match(results.find((result) => result.error)!.error.message, /[Ss]in existencias|[Ss]tock insuficiente/);
  assert.equal((await row(db, 'inventario', itemId)).stock_actual, 0);
  assert.equal((await db.from('movimientos_inventario').select('*')).data.length, 1);
  assert.equal((await db.from('consumos_repuestos').select('*')).data.length, 1);
});

test('part assignment adds its sale price to the current budget without losing an earlier discount', async () => {
  const { db, itemId, orderId } = await fixture();
  await db.from('ordenes').update({ total_estimado: 180 }).eq('id', orderId);
  const assigned = await command(db, { kind: 'assignPart', orderId, itemId, part: { id: crypto.randomUUID(), sku: 'SDD-PART', cantidad: 1 } });
  assert.equal(assigned.error, null);
  assert.equal(assigned.data.orders[0].costo_mano_obra, 200);
  assert.equal(assigned.data.orders[0].total_estimado, 280);
});

test('invalid quantity, changed SKU and exhausted stock leave all transaction participants unchanged', async () => {
  const { db, itemId, orderId } = await fixture();
  for (const part of [{ cantidad: 0, sku: 'SDD-PART' }, { cantidad: -1, sku: 'SDD-PART' }, { cantidad: 0.5, sku: 'SDD-PART' }, { cantidad: 3, sku: 'SDD-PART' }, { cantidad: 1, sku: 'ALTERED' }]) {
    assert.ok((await command(db, { kind: 'assignPart', orderId, itemId, part: { id: crypto.randomUUID(), ...part } })).error);
  }
  assert.equal((await row(db, 'inventario', itemId)).stock_actual, 2);
  assert.deepEqual((await row(db, 'ordenes', orderId)).repuestos_asignados, []);
  assert.equal((await row(db, 'ordenes', orderId)).total_estimado, 200);
  assert.equal((await db.from('consumos_repuestos').select('*')).data.length, 0);
  assert.equal((await db.from('movimientos_inventario').select('*')).data.length, 0);
  assert.equal((await db.from('celmart_sync_operations').select('*')).data.length, 0);
});

test('delivery commits discounted payment, terminal state and server date together; retry cannot recollect', async () => {
  const { db, orderId } = await fixture();
  await db.from('ordenes').update({ estado: 'Listo' }).eq('id', orderId);
  const args = { kind: 'delivery', orderId, from: 'Listo', method: 'Tarjeta', amount: 175.25, at: '1990-01-01T00:00:00Z' };
  const operationId = crypto.randomUUID();
  const first = await command(db, args, operationId);
  assert.equal(first.error, null);
  const delivered = first.data.orders[0];
  assert.equal(delivered.estado, 'Entregado');
  assert.equal(delivered.metodo_pago, 'Tarjeta');
  assert.equal(delivered.monto_cobrado, 175.25);
  assert.ok(Date.parse(delivered.entregado_at) >= Date.parse('2020-01-01'));
  assert.equal(delivered.estado_actualizado_at, delivered.entregado_at);
  const retry = await command(db, args, operationId);
  assert.equal(retry.data.replayed, true);
  assert.equal(retry.data.orders[0].entregado_at, delivered.entregado_at);
  assert.ok((await command(db, { ...args, amount: 1 }, operationId)).error);
  assert.ok((await command(db, args)).error);
  const summary = await db.rpc('resumen_caja', { p_fecha: workshopDate() });
  assert.equal(summary.data.total_tarjeta, 175.25);
  assert.equal(summary.data.sin_metodo, 0);
});

test('bad or stale delivery cannot leave a partial payment behind', async () => {
  const { db, orderId } = await fixture();
  await db.from('ordenes').update({ estado: 'Listo' }).eq('id', orderId);
  for (const patch of [{ method: 'Cheque' }, { method: null }, { amount: undefined }, { amount: -1 }, { amount: Infinity }, { amount: '20' }, { from: 'Recibido' }]) {
    assert.ok((await command(db, { kind: 'delivery', orderId, from: 'Listo', method: 'Efectivo', amount: 200, ...patch })).error);
    const unchanged = await row(db, 'ordenes', orderId);
    assert.equal(unchanged.estado, 'Listo');
    assert.equal(unchanged.metodo_pago, undefined);
    assert.equal(unchanged.monto_cobrado, undefined);
    assert.equal(unchanged.entregado_at, null);
  }
});

test('delivered orders resist status, assignment, direct budget/parts edits and collection changes while warranty creates a child', async () => {
  const { db, itemId, orderId } = await fixture();
  await db.from('ordenes').update({ estado: 'Listo' }).eq('id', orderId);
  assert.equal((await command(db, { kind: 'delivery', orderId, from: 'Listo', method: 'Efectivo', amount: 0 })).error, null);
  const original = await row(db, 'ordenes', orderId);
  assert.ok((await command(db, { kind: 'status', orderId, from: 'Entregado', to: 'En Reparación' })).error);
  assert.ok((await command(db, { kind: 'assignPart', orderId, itemId, part: { id: crypto.randomUUID(), sku: 'SDD-PART', cantidad: 1 } })).error);
  for (const fields of [{ estado: 'Recibido' }, { estado: 'Garantía' }, { repuestos_asignados: [{ sku: 'SDD-PART' }] }, { costo_mano_obra: 0 }, { total_estimado: 1 }, { metodo_pago: 'Tarjeta' }, { monto_cobrado: 1 }]) {
    assert.ok((await db.from('ordenes').update(fields).eq('id', orderId)).error);
  }
  assert.deepEqual(await row(db, 'ordenes', orderId), original);
  assert.equal((await row(db, 'inventario', itemId)).stock_actual, 2);
  const warranty = await db.rpc('reingreso_garantia', { p_order_id: orderId, p_motivo: 'Falla recurrente' });
  assert.equal(warranty.error, null);
  assert.equal(warranty.data.id, `${orderId}-G1`);
  assert.equal(warranty.data.costo_mano_obra, 0);
  assert.deepEqual(await row(db, 'ordenes', orderId), original);
});

test('cash close prevents late delivery and part consumption with no partial stock or payment', async () => {
  const { db, itemId, orderId } = await fixture();
  await db.from('ordenes').update({ estado: 'Listo' }).eq('id', orderId);
  assert.equal((await db.rpc('cerrar_caja', { p_apertura: 0 })).error, null);
  assert.ok((await command(db, { kind: 'delivery', orderId, from: 'Listo', method: 'Transferencia', amount: 200 })).error);
  assert.ok((await command(db, { kind: 'assignPart', orderId, itemId, part: { id: crypto.randomUUID(), sku: 'SDD-PART', cantidad: 1 } })).error);
  assert.equal((await row(db, 'ordenes', orderId)).estado, 'Listo');
  assert.equal((await row(db, 'ordenes', orderId)).metodo_pago, undefined);
  assert.equal((await row(db, 'inventario', itemId)).stock_actual, 2);
  assert.equal((await db.from('movimientos_inventario').select('*')).data.length, 0);
});
