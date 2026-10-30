import assert from 'node:assert/strict';
import test from 'node:test';
import { createMockSupabaseClient } from '../src/lib/supabase';

test('demo queries preserve selected writes and reject stale optimistic locks', async () => {
  const client = createMockSupabaseClient();
  const { data: orders } = await client.from('ordenes').select('*');
  const order = orders[0];
  assert.ok(order);
  const notes = [...order.notas_tecnicas, { id: 'test-note', contenido: 'Diagnóstico' }];
  const query = () => client.from('ordenes').update({ notas_tecnicas: notes })
    .eq('id', order.id).eq('notas_tecnicas', JSON.stringify(order.notas_tecnicas))
    .select('*').maybeSingle();
  const first = await query();
  assert.equal(first.error, null);
  assert.deepEqual(first.data.notas_tecnicas, notes);
  assert.deepEqual(await query(), { data: null, error: null });
  assert.deepEqual(order.notas_tecnicas, first.data.notas_tecnicas.slice(0, -1));
});

test('demo accepts text[] and nullable legacy filters', async () => {
  const client = createMockSupabaseClient();
  await client.from('ordenes').insert({ id: 'legacy', notas_tecnicas: null, fotos_evidencia: ['https://example.com/a.webp'] });
  const { data, error } = await client.from('ordenes').update({ notas_tecnicas: [] })
    .eq('id', 'legacy').is('notas_tecnicas', null)
    .eq('fotos_evidencia', '{"https://example.com/a.webp"}').select('id,notas_tecnicas').single();
  assert.equal(error, null);
  assert.deepEqual(data, { id: 'legacy', notas_tecnicas: [] });
});

test('demo insert rejects duplicate primary keys without partially inserting the payload', async () => {
  const client = createMockSupabaseClient();
  await client.from('orders_unique_test').insert({ id: 'existing', total_estimado: 10 });
  const existingCollision = await client.from('orders_unique_test').insert([
    { id: 'new', total_estimado: 20 }, { id: 'existing', total_estimado: 99 },
  ]);
  assert.equal(existingCollision.error?.code, '23505');
  const payloadCollision = await client.from('orders_unique_test').insert([{ id: 'same' }, { id: 'same' }]);
  assert.equal(payloadCollision.error?.code, '23505');
  const { data } = await client.from('orders_unique_test').select('*');
  assert.equal(data.length, 1);
  assert.equal(data[0].id, 'existing');
  assert.equal(data[0].total_estimado, 10);
});

test('demo select applies inclusive ranges after sorting', async () => {
  const client = createMockSupabaseClient();
  await client.from('orders_range_test').insert([{ id: 'order-4' }, { id: 'order-1' }, { id: 'order-3' }, { id: 'order-2' }]);
  const firstPage = await client.from('orders_range_test').select('id').order('id').range(0, 1);
  const nextPage = await client.from('orders_range_test').select('id').order('id').range(2, 3);
  assert.deepEqual(firstPage.data, [{ id: 'order-1' }, { id: 'order-2' }]);
  assert.deepEqual(nextPage.data, [{ id: 'order-3' }, { id: 'order-4' }]);
});

test('demo channels deliver matching changes and stop after removal', async () => {
  const client = createMockSupabaseClient();
  const changes: any[] = [];
  const channel = client.channel('workshop')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes' }, (change) => changes.push(change))
    .subscribe();
  await client.from('inventario').update({ stock_actual: 9 }).eq('id', 'not-present');
  await client.from('ordenes').insert({ id: 'realtime-test' });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].eventType, 'INSERT');
  assert.equal(changes[0].new.id, 'realtime-test');
  await client.removeChannel(channel);
  await client.from('ordenes').delete().eq('id', 'realtime-test');
  assert.equal(changes.length, 1);
});

test('demo tables survive a new client when localStorage is available', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const saved = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) },
  });
  try {
    const first = createMockSupabaseClient();
    await first.from('ordenes').insert({ id: 'persisted-order', checklist_json: { hdmi: true }, fotos_evidencia: ['data:image/webp;base64,test'] });
    const second = createMockSupabaseClient();
    const { data } = await second.from('ordenes').select('*').eq('id', 'persisted-order').single();
    assert.equal(data.checklist_json.hdmi, true);
    assert.deepEqual(data.fotos_evidencia, ['data:image/webp;base64,test']);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('demo retains in-memory changes after localStorage quota failure', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let saved: string | null = null;
  let failWrites = false;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => saved,
      setItem: (_key: string, value: string) => {
        if (failWrites) throw new Error('QuotaExceededError');
        saved = value;
      },
    },
  });
  const warn = console.warn;
  console.warn = () => {};
  try {
    const client = createMockSupabaseClient();
    await client.from('ordenes').insert({ id: 'quota-order', notas_tecnicas: [] });
    failWrites = true;
    await client.from('ordenes').update({ notas_tecnicas: [{ id: 'unsaved-note' }] }).eq('id', 'quota-order');
    const { data } = await client.from('ordenes').select('*').eq('id', 'quota-order').single();
    assert.deepEqual(data.notas_tecnicas, [{ id: 'unsaved-note' }]);
  } finally {
    console.warn = warn;
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('demo requests origin locks around queries when Web Locks are supported', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const locks: string[] = [];
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { locks: { request: async (key: string, callback: () => unknown) => { locks.push(key); return callback(); } } },
  });
  try {
    const client = createMockSupabaseClient();
    await client.from('ordenes').select('*');
    await client.from('ordenes').insert({ id: 'locked-order' });
    assert.deepEqual(locks, ['celmart:mock-tables:v1', 'celmart:mock-tables:v1']);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});
