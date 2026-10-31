import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolvePendingPhoto,
  encodeSyncCommand,
} from '../src/lib/offlineRepository';
import { createMockSupabaseClient, supabase } from '../src/lib/supabase';
import { initialOrders } from '../src/data/initialData';
import { isValidTrackingOrderId } from '../src/lib/publicTracking';

test('pending WebP uploads use the same deterministic path on retries and never mutate the saved command', async (t) => {
  const uploaded: { path: string; content: string; upsert?: boolean }[] = [];
  t.mock.method(supabase.storage, 'from', (bucket: string) => {
    assert.equal(bucket, 'taller-media');
    return {
      upload: async (
        path: string,
        blob: Blob,
        options: { upsert?: boolean }
      ) => {
        uploaded.push({
          path,
          content: await blob.text(),
          upsert: options.upsert,
        });
        return { error: null };
      },
      getPublicUrl: (path: string) => ({
        data: { publicUrl: 'https://media.example/' + path },
      }),
    };
  });
  const dataUrl = 'data:image/webp;base64,' + btoa('webp-fixture');
  const operation = {
    id: 'op-stable',
    ownerId: 'qa',
    createdAt: 'now',
    command: {
      kind: 'createOrder' as const,
      order: { ...initialOrders[0], fotosEvidencia: [dataUrl] },
    },
  };
  const first = await encodeSyncCommand(operation),
    retry = await encodeSyncCommand(operation);
  assert.deepEqual(first, retry);
  assert.equal(uploaded.length, 2);
  assert.equal(uploaded[0].path, uploaded[1].path);
  assert.equal(uploaded[0].content, 'webp-fixture');
  assert.equal(uploaded[0].upsert, true);
  assert.deepEqual(operation.command.order.fotosEvidencia, [dataUrl]);
  assert.deepEqual(first.photos, [
    'https://media.example/ordenes/offline-op-stable-0.webp',
  ]);
  await assert.rejects(
    resolvePendingPhoto('data:image/png;base64,abc', 'ordenes', 'op', 0),
    /WebP/
  );
});

test('server mock replays the same stock operation without applying its delta twice', async () => {
  const db = createMockSupabaseClient();
  await db
    .from('inventario')
    .insert({
      id: 'qa-offline-item',
      nombre: 'QA',
      sku: 'QA-OFFLINE',
      stock_actual: 3,
    });
  const args = {
    p_operation_id: crypto.randomUUID(),
    p_owner_id: 'mock-user-1',
    p_command: { kind: 'stock', itemId: 'qa-offline-item', delta: -1 },
  };
  const first = await db.rpc('apply_offline_operation', args),
    retry = await db.rpc('apply_offline_operation', args);
  assert.equal(first.error, null);
  assert.equal(retry.data.replayed, true);
  assert.equal(retry.data.inventory[0].stock_actual, 2);
  assert.equal(
    (
      await db
        .from('movimientos_inventario')
        .select('*')
        .eq('id', args.p_operation_id)
    ).data.length,
    1
  );
  assert.ok(
    (
      await db.rpc('apply_offline_operation', {
        ...args,
        p_owner_id: 'different-account',
      })
    ).error
  );
});

test('unique offline folios and their warranty children remain valid tracking links', () => {
  for (const id of ['OS-2401', 'OS-2401-A1B2C3D4', 'OS-2401-A1B2C3D4-G1'])
    assert.equal(isValidTrackingOrderId(id), true, id);
  for (const id of ['OS-2401-<script>', 'OS-2401-XYZ', 'OS-2401-A1B2C3D4\n'])
    assert.equal(isValidTrackingOrderId(id), false, id);
});
