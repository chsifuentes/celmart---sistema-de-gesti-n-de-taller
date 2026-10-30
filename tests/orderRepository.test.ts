import assert from 'node:assert/strict';
import test from 'node:test';
import { initialOrders } from '../src/data/initialData';
import { getNextOrderNumber, mapInventoryRow, mapOrderRow, orderToRow, updateOrderWithRetry } from '../src/lib/orderRepository';
import { createMockSupabaseClient } from '../src/lib/supabase';
import type { AssignedPart, Order, TechNote } from '../src/types';

function orderFixture(id: string): Order {
  return {
    ...initialOrders[0],
    id,
    dispositivo: { ...initialOrders[0].dispositivo, categoria: 'Consola' },
    checklist: { equipoApagado: false, hdmi: false, lectora: true, sellos: false },
    notasTecnicas: [],
    repuestosAsignados: [],
    fotosEvidencia: [],
    costoManoObra: 350,
    totalEstimado: 350,
  };
}

function note(id: string): TechNote {
  return { id, autor: id, fecha: '2026-10-29T14:00:00.000Z', contenido: `Diagnóstico ${id}`, tipo: 'diagnostico' };
}

test('folio recovery pages beyond the response limit and compares numeric suffixes', async () => {
  const database = createMockSupabaseClient();
  await database.from('ordenes').insert([
    ...Array.from({ length: 1105 }, (_, index) => ({ id: `OS-${20000 + index}` })),
    { id: 'OS-9999' }, { id: 'legacy-unrelated' },
  ]);
  assert.equal(await getNextOrderNumber(database), 21105);
});

async function seedOrder(id: string) {
  const database = createMockSupabaseClient();
  const order = orderFixture(id);
  const { error } = await database.from('ordenes').insert(orderToRow(order));
  assert.equal(error, null);
  return { database, order };
}

async function readOrder(database: ReturnType<typeof createMockSupabaseClient>, id: string) {
  const { data, error } = await database.from('ordenes').select('*').eq('id', id).single();
  assert.equal(error, null);
  return mapOrderRow(data);
}

test('database roundtrip retains category, failed checks, notes, parts and evidence', async () => {
  const database = createMockSupabaseClient();
  const original = orderFixture('roundtrip');
  original.notasTecnicas = [note('recepcion')];
  original.repuestosAsignados = [{ id: 'hdmi-1', nombre: 'Conector HDMI', sku: 'HDMI-PS5', cantidad: 2, precioUnitario: 75 }];
  original.fotosEvidencia = ['https://example.test/recepcion.webp', 'data:image/webp;base64,compressed'];
  original.totalEstimado = 500;
  const row = orderToRow(original);
  assert.equal(row.categoria_dispositivo, 'Consola');
  assert.equal(row.checklist_json.hdmi, false);
  await database.from('ordenes').insert(row);

  const restored = await readOrder(database, original.id);
  assert.equal(restored.dispositivo.categoria, 'Consola');
  assert.deepEqual(restored.checklist, original.checklist);
  assert.deepEqual(restored.notasTecnicas, original.notasTecnicas);
  assert.deepEqual(restored.repuestosAsignados, original.repuestosAsignados);
  assert.deepEqual(restored.fotosEvidencia, original.fotosEvidencia);
  assert.equal(restored.totalEstimado, 500);
});

test('legacy nulls default safely and missing checks remain unverified', () => {
  const legacy = mapOrderRow({
    id: 'legacy', categoria_dispositivo: null, checklist_json: null, equipo_apagado: true,
    notas_tecnicas: null, repuestos_asignados: null, fotos_evidencia: null,
    costo_mano_obra: null, total_estimado: null,
  });
  assert.equal(legacy.dispositivo.categoria, 'Smartphone');
  assert.equal(legacy.checklist.camaras, undefined);
  assert.deepEqual(legacy.checklist, { equipoApagado: true });
  assert.deepEqual(legacy.notasTecnicas, []);
  assert.deepEqual(legacy.repuestosAsignados, []);
  assert.deepEqual(legacy.fotosEvidencia, []);
  assert.equal(legacy.costoManoObra, 0);
  assert.equal(legacy.totalEstimado, 0);
  assert.equal(mapOrderRow({ id: 'missing-fields' }).dispositivo.categoria, 'Smartphone');
  assert.equal(mapOrderRow({ categoria_dispositivo: 'obsolete-category' }).dispositivo.categoria, 'Smartphone');
});

test('malformed checklist values do not become passed checks and explicit false wins over legacy flag', () => {
  const restored = mapOrderRow({
    equipo_apagado: true,
    checklist_json: { equipoApagado: false, hdmi: false, lectora: true, desconocido: 'true', nulo: null },
    fotos_evidencia: ['https://example.test/a.webp', null, 42],
  });
  assert.deepEqual(restored.checklist, { equipoApagado: false, hdmi: false, lectora: true });
  assert.deepEqual(restored.fotosEvidencia, ['https://example.test/a.webp']);
});

test('inventory mapping retains image URLs and accepts pre-migration null images', () => {
  const base = { id: 'inv-test', nombre: 'HDMI', sku: 'HDMI-01', categoria: 'Accesorios', stock_actual: '3', precio_venta: '75' };
  const image = 'https://example.test/inventario/hdmi.webp';
  assert.equal(mapInventoryRow({ ...base, imagen_url: image }).imagenUrl, image);
  assert.equal(mapInventoryRow({ ...base, imagen_url: null }).imagenUrl, undefined);
  assert.equal(mapInventoryRow(base).imagenUrl, undefined);
  assert.equal(mapInventoryRow(base).stockActual, 3);
  assert.equal(mapInventoryRow(base).precioVenta, 75);
});

test('simultaneous note appends retry stale reads and preserve both technicians', async () => {
  const { database, order } = await seedOrder('concurrent-notes');
  let changesCalled = 0;
  const append = (entry: TechNote) => updateOrderWithRetry(order.id, ['notas_tecnicas'], (current) => {
    changesCalled++;
    return { notas_tecnicas: [...current.notasTecnicas, entry] };
  }, database);

  await Promise.all([append(note('tecnico-a')), append(note('tecnico-b'))]);
  const restored = await readOrder(database, order.id);
  assert.deepEqual(new Set(restored.notasTecnicas.map((entry) => entry.id)), new Set(['tecnico-a', 'tecnico-b']));
  assert.equal(restored.notasTecnicas.length, 2);
  assert.ok(changesCalled >= 3, 'a stale write must reread the row before retrying');
});

test('simultaneous evidence appends preserve query strings, quotes, backslashes and DataURLs', async () => {
  const { database, order } = await seedOrder('concurrent-photos');
  const photos = [
    'https://example.test/"board"\\front.webp?a=1,b=2&note="top"&x={y}#diagnóstico',
    'data:image/webp;base64,UklGRg==',
  ];
  const append = (url: string) => updateOrderWithRetry(order.id, ['fotos_evidencia'], (current) => ({
    fotos_evidencia: [...(current.fotosEvidencia || []), url],
  }), database);
  await Promise.all(photos.map(append));
  const third = 'https://example.test/third.webp?token=quote"slash\\comma,';
  await append(third);
  const restored = await readOrder(database, order.id);
  assert.deepEqual(new Set(restored.fotosEvidencia), new Set([...photos, third]));
  assert.equal(restored.fotosEvidencia?.length, 3);
});

test('simultaneous part assignments retain both parts and recompute the full total', async () => {
  const { database, order } = await seedOrder('concurrent-parts');
  const parts: AssignedPart[] = [
    { id: 'part-a', nombre: 'HDMI', sku: 'HDMI', cantidad: 2, precioUnitario: 75 },
    { id: 'part-b', nombre: 'IC', sku: 'IC', cantidad: 1, precioUnitario: 120 },
  ];
  const append = (part: AssignedPart) => updateOrderWithRetry(
    order.id, ['repuestos_asignados', 'costo_mano_obra', 'total_estimado'],
    (current) => {
      const next = [...current.repuestosAsignados, part];
      return {
        repuestos_asignados: next,
        total_estimado: current.costoManoObra + next.reduce((total, item) => total + item.cantidad * item.precioUnitario, 0),
      };
    }, database,
  );
  await Promise.all(parts.map(append));
  const restored = await readOrder(database, order.id);
  assert.deepEqual(new Set(restored.repuestosAsignados.map((part) => part.id)), new Set(['part-a', 'part-b']));
  assert.equal(restored.totalEstimado, 620);
});

test('a nullable legacy array can be appended without losing the first write', async () => {
  const { database, order } = await seedOrder('nullable-notes');
  await database.from('ordenes').update({ notas_tecnicas: null }).eq('id', order.id);
  const saved = await updateOrderWithRetry(order.id, ['notas_tecnicas'], (current) => ({
    notas_tecnicas: [...current.notasTecnicas, note('first')],
  }), database);
  assert.deepEqual(saved.notasTecnicas.map((entry) => entry.id), ['first']);
});

function failingDatabase(readResult: { data: unknown; error: unknown }, updateResult = { data: null, error: null as unknown }) {
  const calls = { reads: 0, updates: 0 };
  const database = {
    from() {
      let updating = false;
      const query = {
        select() { return query; },
        eq() { return query; },
        is() { return query; },
        update() { updating = true; return query; },
        async maybeSingle() {
          if (updating) { calls.updates++; return updateResult; }
          calls.reads++;
          return readResult;
        },
      };
      return query;
    },
  };
  return { database, calls };
}

test('database read errors are reported without attempting a write', async () => {
  const { database, calls } = failingDatabase({ data: null, error: { message: 'connection lost' } });
  await assert.rejects(updateOrderWithRetry('unavailable', ['notas_tecnicas'], () => ({}), database), /No se pudo leer la orden: connection lost/);
  assert.deepEqual(calls, { reads: 1, updates: 0 });
});

test('database update errors are reported without claiming a successful save', async () => {
  const { database, calls } = failingDatabase(
    { data: orderToRow(orderFixture('denied')), error: null },
    { data: null, error: { message: 'row-level security denied' } },
  );
  await assert.rejects(updateOrderWithRetry('denied', ['notas_tecnicas'], () => ({ notas_tecnicas: [note('x')] }), database), /No se pudo guardar la orden: row-level security denied/);
  assert.deepEqual(calls, { reads: 1, updates: 1 });
});

test('missing or inaccessible orders fail explicitly without writing', async () => {
  const { database, calls } = failingDatabase({ data: null, error: null });
  await assert.rejects(updateOrderWithRetry('missing', ['notas_tecnicas'], () => ({}), database), /La orden ya no existe o no tienes permiso/);
  assert.deepEqual(calls, { reads: 1, updates: 0 });
});

test('continuous contention stops after five attempts with an actionable error', async () => {
  const { database, calls } = failingDatabase({ data: orderToRow(orderFixture('busy')), error: null });
  await assert.rejects(updateOrderWithRetry('busy', ['notas_tecnicas'], () => ({ notas_tecnicas: [note('x')] }), database), /La orden cambió mientras guardabas/);
  assert.deepEqual(calls, { reads: 5, updates: 5 });
});
