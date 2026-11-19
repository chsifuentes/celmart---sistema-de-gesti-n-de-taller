import assert from 'node:assert/strict';
import test from 'node:test';
import { createMockSupabaseClient } from '../src/lib/supabase';
import { createOfflineSync, QUEUE_KEY, type PendingOperation, type SyncStorage, type WorkshopSnapshot } from '../src/lib/offlineSync';
import { mapInventoryRow } from '../src/lib/orderRepository';
import { mapMovementRow, mapSaleRow } from '../src/lib/offlineRepository';
import { workshopDate } from '../src/lib/operations';
import type { CounterSale } from '../src/types';

class MemoryStorage implements SyncStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

test('a POS receipt lost after server commit recovers the original charge after reload even if the price changes', async () => {
  const db = createMockSupabaseClient();
  const itemId = crypto.randomUUID();
  const inserted = await db.from('inventario').insert({
    id: itemId, sku: 'RECOVERY-POS', nombre: 'Cable de mostrador', categoria: 'Accesorios',
    stock_actual: 2, stock_minimo: 0, costo_compra: 30, precio_venta: 100,
  });
  assert.equal(inserted.error, null);
  const remoteItem = (await db.from('inventario').select('*').eq('id', itemId).single()).data;
  const base: WorkshopSnapshot = { orders: [], inventory: [mapInventoryRow(remoteItem)], clients: [], movements: [], sales: [] };
  const storage = new MemoryStorage();
  let online = false;
  let loseResponse = true;
  const attempts: string[] = [];
  const send = async (operation: PendingOperation) => {
    attempts.push(operation.id);
    const result = await db.rpc('apply_offline_operation', {
      p_operation_id: operation.id, p_owner_id: operation.ownerId, p_command: operation.command,
    });
    if (result.error) throw new Error(result.error.message);
    if (loseResponse) { loseResponse = false; throw new TypeError('Failed to fetch'); }
    return { changes: {
      inventory: result.data.inventory.map(mapInventoryRow),
      movements: result.data.movements.map(mapMovementRow),
      sales: result.data.sales.map(mapSaleRow),
    }, replayed: result.data.replayed };
  };
  const store = createOfflineSync({ storage, online: () => online, send });
  await store.bindOwner('mock-user-1');
  await store.replaceRemote(base);
  const sale: CounterSale = {
    id: crypto.randomUUID(), itemId, sku: remoteItem.sku, nombre: remoteItem.nombre,
    cantidad: 1, precioUnitario: 100, costoUnitario: 30, total: 100,
    metodoPago: 'Tarjeta', createdAt: '1990-01-01T00:00:00Z', pendingSync: true,
  };
  await store.submit({ kind: 'sale', sale });
  online = true;
  await store.flush();
  assert.equal(store.getSnapshot().pending, 1);
  assert.equal(store.getSnapshot().offline, true);
  assert.equal(store.getSnapshot().data.sales[0].pendingSync, true);
  const operationId = JSON.parse(storage.getItem(QUEUE_KEY)!).queue[0].id;

  // A later inventory edit must not turn this retry into a second sale or a new quote.
  await db.from('inventario').update({ precio_venta: 150, costo_compra: 900 }).eq('id', itemId);
  const restored = createOfflineSync({ storage, online: () => online, send });
  await restored.flush(true);
  assert.deepEqual(attempts, [operationId, operationId]);
  assert.equal(restored.getSnapshot().pending, 0);
  assert.equal(restored.getSnapshot().data.sales.length, 1);
  const confirmed = restored.getSnapshot().data.sales[0];
  assert.equal(confirmed.id, sale.id);
  assert.equal(confirmed.total, 100);
  assert.equal(confirmed.precioUnitario, 100);
  assert.equal(confirmed.costoUnitario, 30);
  assert.equal(confirmed.pendingSync, false);
  assert.ok(Date.parse(confirmed.createdAt) > Date.parse('2020-01-01'));
  assert.equal((await db.from('inventario').select('*').eq('id', itemId).single()).data.stock_actual, 1);
  assert.equal((await db.from('ventas_mostrador').select('*')).data.length, 1);
  assert.equal((await db.from('movimientos_inventario').select('*')).data.length, 1);
  assert.equal((await db.from('ordenes').select('*')).data.length, 3);
  const summary = (await db.rpc('resumen_caja', { p_fecha: workshopDate() })).data;
  assert.equal(summary.total_tarjeta, 100);
  assert.equal(summary.gastos_repuestos, 30);
});
