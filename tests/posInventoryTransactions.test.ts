import assert from 'node:assert/strict';
import test from 'node:test';
import { createMockSupabaseClient } from '../src/lib/supabase';
import { workshopDate } from '../src/lib/operations';

type DemoClient = ReturnType<typeof createMockSupabaseClient>;
async function fixture(stock = 3) {
  const db = createMockSupabaseClient();
  const itemId = crypto.randomUUID();
  const orderId = 'OS-99301';
  await db.from('inventario').insert({ id: itemId, sku: 'POS-USB', nombre: 'Cable USB-C', categoria: 'Accesorios', stock_actual: stock, costo_compra: 30, precio_venta: 100 });
  await db.from('ordenes').insert({ id: orderId, estado: 'En Reparación', dispositivo_modelo: 'Tablet', costo_mano_obra: 200, total_estimado: 180, repuestos_asignados: [] });
  return { db, itemId, orderId };
}
const invoke = (db: DemoClient, command: Record<string, unknown>, id = crypto.randomUUID()) => db.rpc('apply_offline_operation', { p_operation_id: id, p_owner_id: 'mock-user-1', p_command: command });
const rows = async (db: DemoClient, table: string) => (await db.from(table).select('*')).data;
const row = async (db: DemoClient, table: string, id: string) => (await db.from(table).select('*').eq('id', id).single()).data;
const saleRequest = (itemId: string, extra: Record<string, unknown> = {}) => ({ kind: 'sale', sale: { id: crypto.randomUUID(), itemId, sku: 'POS-USB', nombre: 'Untrusted name', cantidad: 1, precioUnitario: 100, costoUnitario: 1, metodoPago: 'Efectivo', total: 1, createdAt: '1990-01-01T00:00:00Z', ...extra } });

test('return restores the full assignment once, preserves price/cost snapshots after SKU edits and credits the cost without deleting history', async () => {
  const { db, itemId, orderId } = await fixture();
  const partId = crypto.randomUUID();
  const assigned = await invoke(db, { kind: 'assignPart', itemId, orderId, part: { id: partId, sku: 'POS-USB', cantidad: 2 } });
  assert.equal(assigned.error, null);
  assert.equal(assigned.data.orders[0].repuestos_asignados[0].repuestoId, itemId);
  assert.equal(assigned.data.orders[0].repuestos_asignados[0].costoUnitario, 30);
  await db.from('inventario').update({ sku: 'NEW-SKU', costo_compra: 900, precio_venta: 200 }).eq('id', itemId);
  await db.from('ordenes').update({ total_estimado: 330 }).eq('id', orderId);
  const command = { kind: 'removePart', itemId, orderId, partId, movementId: crypto.randomUUID(), at: new Date().toISOString() };
  const operationId = crypto.randomUUID();
  const result = await invoke(db, command, operationId);
  assert.equal(result.error, null);
  assert.equal(result.data.inventory[0].stock_actual, 3);
  assert.equal(result.data.orders[0].total_estimado, 130);
  assert.deepEqual(result.data.orders[0].repuestos_asignados, []);
  assert.equal(result.data.movements[0].tipo, 'entrada');
  assert.equal(result.data.movements[0].id, command.movementId);
  assert.equal(result.data.movements[0].cantidad, 2);
  assert.equal(result.data.movements[0].costo_unitario, 30);
  assert.equal(result.data.movements[0].motivo, `Retirado de orden ${orderId}`);
  assert.equal((await rows(db, 'consumos_repuestos')).length, 1);
  assert.equal((await rows(db, 'consumos_repuestos'))[0].costo_unitario, 30);
  assert.equal((await rows(db, 'devoluciones_repuestos')).length, 1);
  assert.equal((await invoke(db, command, operationId)).data.replayed, true);
  assert.ok((await invoke(db, { ...command, movementId: crypto.randomUUID() })).error);
  assert.equal((await row(db, 'inventario', itemId)).stock_actual, 3);
  assert.equal((await db.rpc('resumen_caja', { p_fecha: workshopDate() })).data.gastos_repuestos, 0);
});

test('removal floors a discounted estimate at zero without blocking physical inventory return', async () => {
  const { db, itemId, orderId } = await fixture();
  const partId = crypto.randomUUID();
  await invoke(db, { kind: 'assignPart', itemId, orderId, part: { id: partId, sku: 'POS-USB', cantidad: 1 } });
  await db.from('ordenes').update({ total_estimado: 10 }).eq('id', orderId);
  const result = await invoke(db, { kind: 'removePart', orderId, itemId, partId, movementId: crypto.randomUUID() });
  assert.equal(result.error, null);
  assert.equal(result.data.orders[0].total_estimado, 0);
  assert.equal(result.data.inventory[0].stock_actual, 3);
});

test('legacy returns require a unique historical consumption and credit today while leaving a past close immutable', async () => {
  const { db, itemId, orderId } = await fixture(1);
  const yesterday = new Date(Date.now() - 86400000);
  const pastDay = workshopDate(yesterday);
  const part = { id: 'legacy-assignment', sku: 'POS-USB', nombre: 'Cable USB-C', cantidad: 1, precioUnitario: 100 };
  await db.from('ordenes').update({ repuestos_asignados: [part], total_estimado: 280 }).eq('id', orderId);
  await db.from('consumos_repuestos').insert({ id: crypto.randomUUID(), orden_id: orderId, sku: part.sku, cantidad: 1, costo_unitario: 25, consumed_at: yesterday.toISOString() });
  await db.from('cortes_caja').insert({ id: `CAJA-${pastDay}`, fecha: pastDay, gastos_repuestos: 25, total_neto: 975 });
  const pastClose = await row(db, 'cortes_caja', `CAJA-${pastDay}`);
  const result = await invoke(db, { kind: 'removePart', orderId, itemId, partId: part.id, movementId: crypto.randomUUID() });
  assert.equal(result.error, null);
  assert.equal(result.data.movements[0].costo_unitario, 25);
  assert.equal((await db.rpc('resumen_caja', { p_fecha: pastDay })).data.gastos_repuestos, 25);
  assert.equal((await db.rpc('resumen_caja', { p_fecha: workshopDate() })).data.gastos_repuestos, -25);
  assert.deepEqual(await row(db, 'cortes_caja', `CAJA-${pastDay}`), pastClose);
});

test('missing or ambiguous legacy costs stop a return without fabricating expenses or changing stock', async () => {
  for (const count of [0, 2]) {
    const { db, itemId, orderId } = await fixture();
    const part = { id: 'legacy-ambiguous', sku: 'POS-USB', cantidad: 1, precioUnitario: 100 };
    await db.from('ordenes').update({ repuestos_asignados: [part], total_estimado: 280 }).eq('id', orderId);
    for (let index = 0; index < count; index++) await db.from('consumos_repuestos').insert({ id: crypto.randomUUID(), orden_id: orderId, sku: part.sku, cantidad: 1, costo_unitario: 20 + index, consumed_at: new Date().toISOString() });
    const result = await invoke(db, { kind: 'removePart', orderId, itemId, partId: part.id, movementId: crypto.randomUUID() });
    assert.match(result.error.message, /consumo histórico único/);
    assert.equal((await row(db, 'inventario', itemId)).stock_actual, 3);
    assert.deepEqual((await row(db, 'ordenes', orderId)).repuestos_asignados, [part]);
    assert.equal((await rows(db, 'devoluciones_repuestos')).length, 0);
  }
});

test('delivery and the daily close each block returns with no stock or financial side effects', async () => {
  for (const block of ['delivery', 'close']) {
    const { db, itemId, orderId } = await fixture();
    const partId = crypto.randomUUID();
    await invoke(db, { kind: 'assignPart', itemId, orderId, part: { id: partId, sku: 'POS-USB', cantidad: 1 } });
    if (block === 'delivery') {
      await db.from('ordenes').update({ estado: 'Listo' }).eq('id', orderId);
      await invoke(db, { kind: 'delivery', orderId, from: 'Listo', method: 'Efectivo', amount: 280 });
    } else await db.rpc('cerrar_caja', { p_apertura: 100 });
    const original = await row(db, 'ordenes', orderId);
    assert.ok((await invoke(db, { kind: 'removePart', orderId, itemId, partId, movementId: crypto.randomUUID() })).error);
    assert.deepEqual(await row(db, 'ordenes', orderId), original);
    assert.equal((await row(db, 'inventario', itemId)).stock_actual, 2);
    assert.equal((await rows(db, 'devoluciones_repuestos')).length, 0);
  }
});

test('counter sale uses canonical price/cost/date, does not create an order, and replays without charging twice', async () => {
  const { db, itemId } = await fixture();
  const beforeOrders = await rows(db, 'ordenes');
  const command = saleRequest(itemId, { cantidad: 2, metodoPago: 'Tarjeta' });
  const operationId = crypto.randomUUID();
  const result = await invoke(db, command, operationId);
  assert.equal(result.error, null);
  const sale = result.data.sales[0];
  assert.equal(sale.nombre, 'Cable USB-C');
  assert.equal(sale.precio_unitario, 100);
  assert.equal(sale.costo_unitario, 30);
  assert.equal(sale.total, 200);
  assert.equal(sale.metodo_pago, 'Tarjeta');
  assert.ok(Date.parse(sale.created_at) > Date.parse('2020-01-01'));
  assert.equal(result.data.inventory[0].stock_actual, 1);
  assert.equal(result.data.movements[0].id, sale.id);
  assert.equal(result.data.movements[0].motivo, 'Venta de mostrador');
  assert.equal(result.data.movements[0].tipo, 'salida');
  assert.equal(result.data.movements[0].cantidad, -2);
  assert.deepEqual(await rows(db, 'ordenes'), beforeOrders);
  assert.equal((await invoke(db, command, operationId)).data.replayed, true);
  assert.ok((await invoke(db, command)).error);
  assert.equal((await rows(db, 'ventas_mostrador')).length, 1);
  assert.equal((await rows(db, 'movimientos_inventario')).length, 1);
  const summary = (await db.rpc('resumen_caja', { p_fecha: workshopDate() })).data;
  assert.equal(summary.total_tarjeta, 200);
  assert.equal(summary.gastos_repuestos, 60);
});

test('counter sales in all payment methods flow into the same daily close and preserve purchase-cost snapshots', async () => {
  const { db, itemId } = await fixture(4);
  for (const method of ['Efectivo', 'Transferencia', 'Tarjeta']) assert.equal((await invoke(db, saleRequest(itemId, { metodoPago: method }))).error, null);
  await db.from('inventario').update({ costo_compra: 900 }).eq('id', itemId);
  const summary = (await db.rpc('resumen_caja', { p_fecha: workshopDate() })).data;
  assert.equal(summary.total_efectivo, 100);
  assert.equal(summary.total_transferencia, 100);
  assert.equal(summary.total_tarjeta, 100);
  assert.equal(summary.gastos_repuestos, 90);
  const closed = await db.rpc('cerrar_caja', { p_apertura: 50 });
  assert.equal(closed.data.total_neto, 260);
  assert.equal((await invoke(db, saleRequest(itemId))).data, null);
  assert.equal((await row(db, 'inventario', itemId)).stock_actual, 1);
  assert.equal((await rows(db, 'ventas_mostrador')).length, 3);
});

test('POS and repair assignment competing for one item cannot oversell stock', async () => {
  const { db, itemId, orderId } = await fixture(1);
  const results = await Promise.all([
    invoke(db, saleRequest(itemId)),
    invoke(db, { kind: 'assignPart', orderId, itemId, part: { id: crypto.randomUUID(), sku: 'POS-USB', cantidad: 1 } }),
  ]);
  assert.equal(results.filter((result) => !result.error).length, 1);
  assert.match(results.find((result) => result.error)!.error.message, /[Ss]in existencias|[Ss]tock insuficiente/);
  assert.equal((await row(db, 'inventario', itemId)).stock_actual, 0);
  assert.equal((await rows(db, 'movimientos_inventario')).length, 1);
});

test('stale, tampered or invalid POS prices and quantities fail before any sale, stock delta or journal acknowledgment', async () => {
  const { db, itemId } = await fixture();
  for (const patch of [{ precioUnitario: 1 }, { precioUnitario: -1 }, { precioUnitario: undefined }, { precioUnitario: Infinity }, { precioUnitario: '100' }, { cantidad: 0 }, { cantidad: -1 }, { cantidad: 0.5 }, { cantidad: 4 }, { metodoPago: 'Cheque' }, { sku: 'WRONG' }]) assert.ok((await invoke(db, saleRequest(itemId, patch))).error);
  const stale = saleRequest(itemId);
  await db.from('inventario').update({ precio_venta: 150 }).eq('id', itemId);
  assert.match((await invoke(db, stale)).error.message, /precio de venta cambió/);
  assert.equal((await row(db, 'inventario', itemId)).stock_actual, 3);
  assert.equal((await rows(db, 'ventas_mostrador')).length, 0);
  assert.equal((await rows(db, 'movimientos_inventario')).length, 0);
  assert.equal((await rows(db, 'celmart_sync_operations')).length, 0);
});
