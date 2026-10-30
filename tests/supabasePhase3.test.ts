import assert from 'node:assert/strict';
import test from 'node:test';
import { createMockSupabaseClient } from '../src/lib/supabase';

test('shared config starts empty, upserts singleton, and insert-only seeding cannot overwrite another workstation', async () => {
  const client = createMockSupabaseClient();
  assert.deepEqual((await client.from('configuracion_taller').select('*')).data, []);
  const seeded = await client.from('configuracion_taller').upsert({ id: 'default', config_json: { nombreTaller: 'CelMart A' } }, { onConflict: 'id', ignoreDuplicates: true }).select('*').single();
  assert.equal(seeded.error, null);
  assert.ok(seeded.data.updated_at);
  const skipped = await client.from('configuracion_taller').upsert({ id: 'default', config_json: { nombreTaller: 'Stale PC settings' } }, { onConflict: 'id', ignoreDuplicates: true }).select('*').maybeSingle();
  assert.deepEqual(skipped, { data: null, error: null });
  const saved = await client.from('configuracion_taller').upsert({ id: 'default', config_json: { nombreTaller: 'CelMart B' } }, { onConflict: 'id' }).select('*').single();
  assert.equal(saved.data.config_json.nombreTaller, 'CelMart B');
  assert.equal((await client.from('configuracion_taller').select('*')).data.length, 1);
  assert.equal((await client.from('configuracion_taller').insert({ id: 'another', config_json: {} })).error?.code, '23514');
});

test('config default id and realtime reflect actual saved config updates', async () => {
  const client = createMockSupabaseClient();
  const events: any[] = [];
  const channel = client.channel('shared-config').on('postgres_changes', { event: '*', table: 'configuracion_taller' }, (event) => events.push(event)).subscribe();
  const first = await client.from('configuracion_taller').insert({ config_json: { nombreTaller: 'Default ID' } }).select('*').single();
  assert.equal(first.data.id, 'default');
  await client.from('configuracion_taller').upsert({ id: 'default', config_json: { nombreTaller: 'Updated' } });
  assert.deepEqual(events.map((event) => event.eventType), ['INSERT', 'UPDATE']);
  assert.equal(events[1].new.config_json.nombreTaller, 'Updated');
  await client.removeChannel(channel);
});

test('public tracking RPC exposes only explicit safe fields and masks customer phone', async () => {
  const client = createMockSupabaseClient();
  await client.from('ordenes').insert({
    id: 'OS-90001', estado: 'Listo', dispositivo_marca: 'Marca', dispositivo_modelo: 'Modelo', categoria_dispositivo: 'Consola',
    cliente_nombre: 'SECRET-NAME', cliente_email: 'SECRET-EMAIL', cliente_telefono: '+52 55 5000 5678',
    dispositivo_imei: 'SECRET-IMEI', dispositivo_clave: 'SECRET-PIN', pre_diagnostico: 'SECRET-DIAGNOSIS',
    notas_tecnicas: [{ contenido: 'SECRET-NOTE' }], checklist_json: { secret: true },
    falla_declarada: 'No enciende', fotos_evidencia: ['https://example.invalid/evidence.webp'], costo_mano_obra: 300, total_estimado: 500, garantia_dias: 60,
    repuestos_asignados: [{ nombre: 'Puerto', cantidad: 1, precioUnitario: 200, sku: 'SECRET-SKU', private: 'SECRET-PART' }],
  });
  await client.from('configuracion_taller').upsert({ id: 'default', config_json: {
    nombreTaller: 'CelMart privado', telefono: '5551234567', politicaGarantiaTexto: 'Garantía de reparación', simboloMoneda: '$',
    whatsappApiKey: 'SECRET-API-KEY', whatsappApiUrl: 'SECRET-API-URL', email: 'SECRET-WORKSHOP-EMAIL',
  } });
  const { data, error } = await client.rpc('get_order_tracking', { p_order_id: 'OS-90001' });
  assert.equal(error, null);
  assert.deepEqual(Object.keys(data).sort(), ['id', 'estado', 'dispositivo', 'fallaDeclarada', 'fotosEvidencia', 'costoManoObra', 'totalEstimado', 'garantiaDias', 'fechaEntrega', 'clienteTelefonoMascara', 'repuestos', 'taller'].sort());
  assert.equal(data.clienteTelefonoMascara, '***-***-5678');
  assert.deepEqual(data.dispositivo, { marca: 'Marca', modelo: 'Modelo', categoria: 'Consola' });
  assert.deepEqual(data.repuestos, [{ nombre: 'Puerto', cantidad: 1, precioUnitario: 200 }]);
  assert.deepEqual(data.taller, { nombre: 'CelMart privado', telefono: '5551234567', politicaGarantiaTexto: 'Garantía de reparación', simboloMoneda: '$' });
  assert.equal(data.fechaEntrega, null);
  assert.ok(!JSON.stringify(data).includes('SECRET-'));
  assert.ok(!JSON.stringify(data).includes('525550005678'));
  assert.ok(!JSON.stringify(data).includes('+52 55 5000 5678'));
});

test('tracking rejects non-exact or oversized IDs and safely defaults malformed optional values', async () => {
  const client = createMockSupabaseClient();
  for (const id of ['OS-999999999', 'OS-1 OR 1=1', 'OS-1%', 'os-1', ' OS-1', `OS-${'9'.repeat(65)}`]) {
    assert.deepEqual(await client.rpc('get_order_tracking', { p_order_id: id }), { data: null, error: null });
  }
  await client.from('ordenes').insert({ id: 'OS-90002', estado: 'Recibido', cliente_telefono: '12', repuestos_asignados: { hidden: 'secret' }, categoria_dispositivo: 'Unknown' });
  const { data } = await client.rpc('get_order_tracking', { p_order_id: 'OS-90002' });
  assert.equal(data.dispositivo.categoria, 'Smartphone');
  assert.deepEqual(data.repuestos, []);
  assert.deepEqual(data.fotosEvidencia, []);
  assert.equal(data.clienteTelefonoMascara, 'Sin teléfono');
  assert.equal(data.totalEstimado, 0);
  assert.equal(data.taller.nombre, 'CelMart');
});

test('public tracking broadcasts only orderId and never raw order or config fields', async () => {
  const client = createMockSupabaseClient();
  const events: any[] = [];
  const unrelated: any[] = [];
  const channel = client.channel('tracking:OS-90003', { config: { private: false } }).on('broadcast', { event: 'order_changed' }, (event) => events.push(event)).subscribe();
  const other = client.channel('tracking:OS-90004').on('broadcast', { event: 'order_changed' }, (event) => unrelated.push(event)).subscribe();
  await client.from('ordenes').insert({ id: 'OS-90003', estado: 'Recibido', cliente_nombre: 'SECRET-NAME', dispositivo_clave: 'SECRET-PIN' });
  await client.from('ordenes').update({ estado: 'Listo', notas_tecnicas: ['SECRET-NOTES'] }).eq('id', 'OS-90003');
  await client.from('configuracion_taller').upsert({ id: 'default', config_json: { whatsappApiKey: 'SECRET-KEY' } });
  await client.from('ordenes').delete().eq('id', 'OS-90003');
  assert.equal(events.length, 3);
  assert.equal(unrelated.length, 0);
  for (const event of events) assert.deepEqual(event, { type: 'broadcast', event: 'order_changed', payload: { orderId: 'OS-90003' } });
  await client.removeChannel(channel);
  await client.removeChannel(other);
});

test('first delivery stamp is authoritative and survives re-delivery and arbitrary client timestamps', async () => {
  const client = createMockSupabaseClient();
  await client.from('ordenes').insert({ id: 'OS-90005', estado: 'Listo', entregado_at: '1990-01-01T00:00:00Z' });
  const before = await client.from('ordenes').select('*').eq('id', 'OS-90005').single();
  assert.equal(before.data.entregado_at, null);
  const delivered = await client.from('ordenes').update({ estado: 'Entregado', entregado_at: '1990-01-01T00:00:00Z' }).eq('id', 'OS-90005').select('*').single();
  const timestamp = delivered.data.entregado_at;
  assert.ok(timestamp && Date.parse(timestamp) > Date.parse('2020-01-01'));
  await client.from('ordenes').update({ estado: 'Garantía', entregado_at: null }).eq('id', 'OS-90005');
  const again = await client.from('ordenes').update({ estado: 'Entregado', entregado_at: '2090-01-01T00:00:00Z' }).eq('id', 'OS-90005').select('*').single();
  assert.equal(again.data.entregado_at, timestamp);
  const tracking = await client.rpc('get_order_tracking', { p_order_id: 'OS-90005' });
  assert.equal(tracking.data.fechaEntrega, timestamp);
});

test('legacy delivered orders keep an unknown date until a real later delivery transition', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let saved = JSON.stringify({ ordenes: [{ id: 'OS-90006', estado: 'Entregado', entregado_at: null }] });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } },
  });
  try {
    const client = createMockSupabaseClient();
    await client.from('ordenes').update({ notas_tecnicas: [], entregado_at: '1990-01-01' }).eq('id', 'OS-90006');
    const unchanged = await client.from('ordenes').update({ estado: 'Entregado' }).eq('id', 'OS-90006').select('*').single();
    assert.equal(unchanged.data.entregado_at, null);
    await client.from('ordenes').update({ estado: 'Garantía' }).eq('id', 'OS-90006');
    const delivered = await client.from('ordenes').update({ estado: 'Entregado' }).eq('id', 'OS-90006').select('*').single();
    assert.ok(delivered.data.entregado_at);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
