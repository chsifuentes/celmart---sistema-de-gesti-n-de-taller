import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CACHE_KEYS,
  QUEUE_KEY,
  createOfflineSync,
  isNetworkError,
  projectCommand,
  type PendingOperation,
  type SyncStorage,
  type WorkshopSnapshot,
} from '../src/lib/offlineSync';
import { initialOrders, initialInventoryItems } from '../src/data/initialData';

class MemoryStorage implements SyncStorage {
  entries = new Map<string, string>();
  full = false;
  getItem(key: string) {
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.full) throw new DOMException('Full', 'QuotaExceededError');
    this.entries.set(key, value);
  }
}
const fixture = (): WorkshopSnapshot => ({
  orders: [
    {
      ...initialOrders[0],
      estado: 'Recibido',
      notasTecnicas: [],
      fotosEvidencia: [],
    },
  ],
  inventory: [{ ...initialInventoryItems[0], stockActual: 5 }],
  clients: [],
  movements: [],
  sales: [],
});
const note = (text: string) => ({
  kind: 'note' as const,
  orderId: initialOrders[0].id,
  note: { id: 'note-' + text, autor: 'QA', fecha: 'Ahora', contenido: text },
});
const stock = () => ({
  kind: 'stock' as const,
  itemId: initialInventoryItems[0].id,
  delta: -1,
  movement: {
    id: crypto.randomUUID(),
    repuestoNombre: 'QA',
    tipo: 'consumo' as const,
    cantidad: -1,
    autor: 'QA',
    tiempo: 'Ahora',
  },
});
const noSend = async () => {
  throw new Error('Network must not be called');
};

test('part assignment projects stock, priced budget and one linked Kardex exit together', () => {
  const base=fixture();
  const item=base.inventory[0], order=base.orders[0];
  const part={id:crypto.randomUUID(),sku:item.sku,nombre:'Untrusted label',cantidad:2,precioUnitario:0};
  const next=projectCommand(base,{kind:'assignPart',orderId:order.id,itemId:item.id,part},true);
  assert.equal(base.inventory[0].stockActual,5);
  assert.equal(next.inventory[0].stockActual,3);
  assert.equal(next.orders[0].repuestosAsignados.at(-1)!.precioUnitario,item.precioVenta);
  assert.equal(next.orders[0].totalEstimado,order.totalEstimado+2*item.precioVenta);
  assert.equal(next.movements.length,1);
  assert.equal(next.movements[0].id,part.id);
  assert.equal(next.movements[0].tipo,'salida');
  assert.equal(next.movements[0].cantidad,-2);
  assert.equal(next.movements[0].motivo,`Asignado a orden ${order.id} (${order.dispositivo.modelo})`);
  assert.equal(next.movements[0].costoUnitario,item.costoCompra);
  assert.throws(()=>projectCommand(next,{kind:'assignPart',orderId:order.id,itemId:item.id,part},true),/ya está registrada/);
});

test('zero stock and delivered parents reject assignments before changing inventory or budgets', () => {
  const base=fixture(), item=base.inventory[0], order=base.orders[0];
  const command={kind:'assignPart' as const,orderId:order.id,itemId:item.id,part:{id:crypto.randomUUID(),sku:item.sku,nombre:item.nombre,cantidad:1,precioUnitario:item.precioVenta}};
  assert.throws(()=>projectCommand({...base,inventory:[{...item,stockActual:0}]},command,true),/Stock insuficiente/);
  assert.throws(()=>projectCommand({...base,orders:[{...order,estado:'Entregado'}]},command,true),/entregada/);
  assert.equal(base.inventory[0].stockActual,5);
  assert.equal(base.movements.length,0);
});

test('offline delivery journals its card payment, discount and final state as one durable command', async () => {
  const storage=new MemoryStorage(), base=fixture();
  base.orders[0]={...base.orders[0],estado:'Listo',totalEstimado:1000,metodoPago:undefined,montoCobrado:undefined};
  const store=createOfflineSync({storage,online:()=>false,send:noSend});
  await store.bindOwner('qa');await store.replaceRemote(base);
  await store.submit({kind:'delivery',orderId:base.orders[0].id,from:'Listo',method:'Tarjeta',amount:850,at:'2026-11-02T18:00:00Z'});
  const journal=JSON.parse(storage.getItem(QUEUE_KEY)!);
  assert.equal(journal.queue.length,1);assert.equal(journal.queue[0].command.kind,'delivery');
  const restored=createOfflineSync({storage,online:()=>false,send:noSend});
  const delivered=restored.getSnapshot().data.orders[0];
  assert.equal(delivered.estado,'Entregado');assert.equal(delivered.metodoPago,'Tarjeta');
  assert.equal(delivered.montoCobrado,850);assert.equal(delivered.totalEstimado,1000);
  assert.equal(delivered.fechaEntrega,'2026-11-02T18:00:00Z');
  await assert.rejects(store.submit({kind:'status',orderId:delivered.id,from:'Entregado',to:'En Reparación',at:new Date().toISOString()}),/garantía/);
  await assert.rejects(store.submit({kind:'payment',orderId:delivered.id,method:'Efectivo',amount:1}),/bloqueado/);
  assert.equal(restored.getSnapshot().pending,1);
});

test('delivery requires a ready order, a valid method and a nonnegative amount', () => {
  const base=fixture(), order=base.orders[0];
  const command={kind:'delivery' as const,orderId:order.id,from:'Listo' as const,method:'Efectivo' as const,amount:100,at:new Date().toISOString()};
  assert.throws(()=>projectCommand(base,command,true),/Lista/);
  const ready={...base,orders:[{...order,estado:'Listo' as const}]};
  assert.throws(()=>projectCommand(ready,{...command,amount:-1},true),/importe/);
  assert.throws(()=>projectCommand(ready,{...command,amount:Number.NaN},true),/importe/);
  assert.throws(()=>projectCommand(ready,{kind:'status',orderId:order.id,from:'Listo',to:'Entregado',at:command.at},true),/cobro/);
  assert.equal(ready.orders[0].estado,'Listo');
});

test('cached arrays hydrate synchronously, malformed values stay safe, and empty remote lists replace stale data', async () => {
  const storage = new MemoryStorage();
  storage.setItem(CACHE_KEYS.orders, JSON.stringify(fixture().orders));
  storage.setItem(CACHE_KEYS.clients, 'broken-json');
  const store = createOfflineSync({
    storage,
    online: () => false,
    send: noSend,
  });
  assert.equal(store.getSnapshot().data.orders.length, 1);
  assert.deepEqual(store.getSnapshot().data.clients, []);
  await store.bindOwner('qa');
  await store.replaceRemote({ orders: [] });
  assert.deepEqual(JSON.parse(storage.getItem(CACHE_KEYS.orders)!), []);
});
test('offline notes and stock are durable before React notification, survive a new store and do not double apply', async () => {
  const storage = new MemoryStorage();
  const store = createOfflineSync({
    storage,
    online: () => false,
    send: noSend,
  });
  await store.bindOwner('qa');
  await store.replaceRemote(fixture());
  let notified = false;
  store.subscribe(() => {
    if (store.getSnapshot().pending) {
      notified = true;
      assert.ok(storage.getItem(QUEUE_KEY)?.includes('note-unplugged'));
    }
  });
  await store.submit(note('unplugged'));
  await store.submit(stock());
  assert.equal(notified, true);
  const restored = createOfflineSync({
    storage,
    online: () => false,
    send: noSend,
  });
  assert.equal(restored.getSnapshot().pending, 2);
  assert.equal(restored.getSnapshot().data.inventory[0].stockActual, 4);
  assert.equal(restored.getSnapshot().data.orders[0].notasTecnicas.length, 1);
  assert.equal(
    JSON.parse(storage.getItem(CACHE_KEYS.inventory)!)[0].stockActual,
    4
  );
});
test('FIFO flush serializes concurrent callers and preserves notes queued while a request is in flight', async () => {
  const storage = new MemoryStorage();
  let online = false;
  let remote = fixture();
  const seen: string[] = [];
  let unblock!: () => void;
  const gate = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  const store = createOfflineSync({
    storage,
    online: () => online,
    send: async (op) => {
      seen.push(op.id);
      if (seen.length === 1) await gate;
      remote = projectCommand(remote, op.command);
      return { changes: remote };
    },
  });
  await store.bindOwner('qa');
  await store.replaceRemote(remote);
  const first = await store.enqueue(note('first'));
  online = true;
  const flush = store.flush();
  await Promise.resolve();
  await Promise.resolve();
  await store.enqueue(note('second'));
  const duplicateFlush = store.flush();
  unblock();
  await Promise.all([flush, duplicateFlush]);
  assert.equal(seen.length, 2);
  assert.equal(seen[0], first);
  assert.equal(store.getSnapshot().pending, 0);
  assert.deepEqual(
    store
      .getSnapshot()
      .data.orders[0].notasTecnicas.map((row) => row.contenido),
    ['second', 'first']
  );
});
test('a lost response keeps the exact operation ID for idempotent replay without applying stock twice', async () => {
  const storage = new MemoryStorage();
  let online = false,
    loseResponse = true,
    remote = fixture();
  const receipts = new Map<string, WorkshopSnapshot>();
  const seen: string[] = [];
  const store = createOfflineSync({
    storage,
    online: () => online,
    send: async (op) => {
      seen.push(op.id);
      if (!receipts.has(op.id)) {
        remote = projectCommand(remote, op.command);
        receipts.set(op.id, remote);
      }
      if (loseResponse) throw new TypeError('Failed to fetch after commit');
      return { changes: receipts.get(op.id)! };
    },
  });
  await store.bindOwner('qa');
  await store.replaceRemote(remote);
  await store.submit(stock());
  online = true;
  await store.flush();
  assert.equal(store.getSnapshot().pending, 1);
  assert.equal(store.getSnapshot().offline, true);
  loseResponse = false;
  const recovered = createOfflineSync({
    storage,
    online: () => true,
    send: async (op) => {
      seen.push(op.id);
      return { changes: receipts.get(op.id)! };
    },
  });
  await recovered.flush();
  assert.equal(seen[0], seen[1]);
  assert.equal(recovered.getSnapshot().pending, 0);
  assert.equal(recovered.getSnapshot().data.inventory[0].stockActual, 4);
});
test('domain/authentication conflicts stop FIFO and are retained instead of pretending synchronization succeeded', async () => {
  const storage = new MemoryStorage();
  let online = false,
    blocked = true,
    requests = 0;
  let remote = fixture();
  const store = createOfflineSync({
    storage,
    online: () => online,
    send: async (op) => {
      requests++;
      if (blocked)
        throw {
          message: 'Conflicto: otra persona cambió el estado',
          code: 'P0001',
        };
      remote = projectCommand(remote, op.command);
      return { changes: remote };
    },
  });
  await store.bindOwner('qa');
  await store.replaceRemote(remote);
  await store.enqueue(note('a'));
  await store.enqueue(note('b'));
  online = true;
  await store.flush();
  assert.equal(requests, 1);
  assert.equal(store.getSnapshot().pending, 2);
  assert.match(store.getSnapshot().error!, /Conflicto/);
  await store.flush();
  assert.equal(requests, 1);
  blocked = false;
  await store.flush(true);
  assert.equal(store.getSnapshot().pending, 0);
});
test('quota failure rejects the new mutation before changing the view or losing earlier pending work', async () => {
  const storage = new MemoryStorage();
  const store = createOfflineSync({
    storage,
    online: () => false,
    send: noSend,
  });
  await store.bindOwner('qa');
  await store.replaceRemote(fixture());
  await store.enqueue(note('safe'));
  const before = storage.getItem(QUEUE_KEY);
  storage.full = true;
  await assert.rejects(store.enqueue(note('lost')), /lleno|bloqueado/);
  assert.equal(storage.getItem(QUEUE_KEY), before);
  assert.equal(store.getSnapshot().pending, 1);
  assert.equal(
    store.getSnapshot().data.orders[0].notasTecnicas[0].contenido,
    'safe'
  );
});
test('in-flight refreshes cannot erase optimistic changes, and a different account cannot send another user queue', async () => {
  const storage = new MemoryStorage();
  const store = createOfflineSync({
    storage,
    online: () => false,
    send: noSend,
  });
  await store.bindOwner('qa');
  await store.replaceRemote(fixture());
  await store.enqueue(note('local'));
  await store.replaceRemote({ orders: [] });
  assert.equal(
    store.getSnapshot().data.orders[0].notasTecnicas[0].contenido,
    'local'
  );
  await assert.rejects(store.bindOwner('someone-else'), /otra cuenta/);
  assert.equal(store.getSnapshot().ownerId, 'qa');
});
test('two tabs sharing the journal and Web Locks preserve both concurrent enqueue operations', async () => {
  const storage = new MemoryStorage();
  const gates = new Map<string, Promise<void>>();
  const lock = async <T>(name: string, run: () => Promise<T>) => {
    const prior = gates.get(name) || Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => (release = resolve));
    gates.set(name, next);
    await prior;
    try {
      return await run();
    } finally {
      release();
    }
  };
  const options = { storage, online: () => false, send: noSend, lock };
  const a = createOfflineSync(options);
  await a.bindOwner('qa');
  await a.replaceRemote(fixture());
  const b = createOfflineSync(options);
  await Promise.all([a.enqueue(note('tab-a')), b.enqueue(note('tab-b'))]);
  a.reload();
  assert.equal(a.getSnapshot().pending, 2);
  assert.equal(a.getSnapshot().data.orders[0].notasTecnicas.length, 2);
});
test('corrupt journals are preserved for recovery and never overwritten by a new command', async () => {
  const storage = new MemoryStorage();
  storage.setItem(QUEUE_KEY, '{invalid');
  const store = createOfflineSync({
    storage,
    online: () => false,
    send: noSend,
  });
  await assert.rejects(store.enqueue(note('x')), /cola|Cola/);
  assert.equal(storage.getItem(QUEUE_KEY), '{invalid');
  assert.ok(store.getSnapshot().error);
});
test('network errors are distinct from business/permission failures', () => {
  assert.equal(isNetworkError({ message: 'TypeError: Failed to fetch' }), true);
  assert.equal(
    isNetworkError(new DOMException('Timeout', 'TimeoutError')),
    true
  );
  assert.equal(
    isNetworkError({ message: 'Stock insuficiente', code: 'P0001' }),
    false
  );
  assert.equal(
    isNetworkError({ message: 'permission denied', code: '42501' }),
    false
  );
});
test('explicit rejection recovery removes a failed local creation with its dependent changes, never ambiguous network writes', async () => {
  const storage = new MemoryStorage();
  let online = false;
  const store = createOfflineSync({
    storage,
    online: () => online,
    send: async () => {
      throw new Error('SKU duplicado');
    },
  });
  await store.bindOwner('qa');
  await store.replaceRemote(fixture());
  const item = { ...initialInventoryItems[0], id: 'local-item' };
  await store.enqueue({ kind: 'createInventory', item });
  await store.enqueue({
    kind: 'editInventory',
    item: { ...item, imagenUrl: 'data:image/webp;base64,WA==' },
    previousStock: item.stockActual,
  });
  assert.equal(store.getSnapshot().data.inventory.length, 2);
  await assert.rejects(store.discardRejected(), /rechazado/);
  online = true;
  await store.flush();
  assert.equal(store.getSnapshot().canDiscard, true);
  await store.discardRejected();
  assert.equal(store.getSnapshot().pending, 0);
  assert.equal(store.getSnapshot().data.inventory.length, 1);
});

test('pre-POS journals upgrade without losing their owner, cached orders or pending FIFO operations', async () => {
  const storage=new MemoryStorage();
  const legacy=fixture() as Partial<WorkshopSnapshot>;
  delete legacy.sales;
  const operation={id:crypto.randomUUID(),ownerId:'qa',createdAt:new Date().toISOString(),command:note('legacy-kept')};
  storage.setItem(QUEUE_KEY,JSON.stringify({version:1,ownerId:'qa',base:legacy,queue:[operation]}));
  const store=createOfflineSync({storage,online:()=>false,send:noSend});
  assert.equal(store.getSnapshot().error,null);
  assert.equal(store.getSnapshot().pending,1);
  assert.equal(store.getSnapshot().data.orders[0].notasTecnicas[0].contenido,'legacy-kept');
  assert.deepEqual(store.getSnapshot().data.sales,[]);
  await store.enqueue(note('new-kept'));
  const saved=JSON.parse(storage.getItem(QUEUE_KEY)!);
  assert.equal(saved.queue[0].id,operation.id);
  assert.equal(saved.queue.length,2);
  assert.deepEqual(saved.base.sales,[]);
});

test('offline part return restores its full quantity by stable inventory ID and reverses its original price once', async () => {
  const storage=new MemoryStorage(),base=fixture(),item=base.inventory[0],order=base.orders[0];
  const store=createOfflineSync({storage,online:()=>false,send:noSend});
  await store.bindOwner('qa');await store.replaceRemote(base);
  const part={id:crypto.randomUUID(),sku:item.sku,nombre:item.nombre,cantidad:2,precioUnitario:item.precioVenta};
  await store.submit({kind:'assignPart',orderId:order.id,itemId:item.id,part});
  const assigned=store.getSnapshot().data.orders[0].repuestosAsignados.find(row=>row.id===part.id)!;
  assert.equal(assigned.repuestoId,item.id);
  const movementId=crypto.randomUUID();
  await store.submit({kind:'removePart',orderId:order.id,partId:part.id,itemId:item.id,movementId,at:new Date().toISOString()});
  const restored=createOfflineSync({storage,online:()=>false,send:noSend});
  const state=restored.getSnapshot();
  assert.equal(state.pending,2);
  assert.equal(state.data.inventory[0].stockActual,5);
  assert.equal(state.data.orders[0].totalEstimado,order.totalEstimado);
  assert.equal(state.data.orders[0].repuestosAsignados.some(row=>row.id===part.id),false);
  assert.equal(state.data.movements.find(row=>row.id===movementId)!.cantidad,2);
  assert.equal(state.data.movements.find(row=>row.id===movementId)!.motivo,`Retirado de orden ${order.id}`);
  await assert.rejects(store.submit({kind:'removePart',orderId:order.id,partId:part.id,itemId:item.id,movementId:crypto.randomUUID(),at:new Date().toISOString()}),/asignación/);
  const renamed={...base,orders:[{...order,repuestosAsignados:[{...assigned,repuestoId:item.id}]}],inventory:[{...item,sku:'SKU-RENAMED',precioVenta:9999}]};
  const returned=projectCommand(renamed,{kind:'removePart',orderId:order.id,partId:part.id,itemId:item.id,movementId,at:new Date().toISOString()},true);
  assert.equal(returned.inventory[0].stockActual,7);
  assert.equal(returned.orders[0].totalEstimado,Math.max(0,order.totalEstimado-2*assigned.precioUnitario));
});

test('offline POS persists one sale, stock and Kardex without creating an order and keeps the quoted total during replay', async () => {
  const storage=new MemoryStorage(),base=fixture(),item=base.inventory[0];
  const store=createOfflineSync({storage,online:()=>false,send:noSend});
  await store.bindOwner('qa');await store.replaceRemote(base);
  const sale={id:crypto.randomUUID(),itemId:item.id,sku:item.sku,nombre:item.nombre,cantidad:2,precioUnitario:item.precioVenta,costoUnitario:item.costoCompra,metodoPago:'Transferencia' as const,total:item.precioVenta*2,createdAt:new Date().toISOString()};
  await store.submit({kind:'sale',sale});
  const restored=createOfflineSync({storage,online:()=>false,send:noSend});
  assert.equal(restored.getSnapshot().pending,1);
  assert.equal(restored.getSnapshot().data.inventory[0].stockActual,3);
  assert.equal(restored.getSnapshot().data.orders.length,base.orders.length);
  assert.equal(restored.getSnapshot().data.sales[0].id,sale.id);
  assert.equal(restored.getSnapshot().data.sales[0].pendingSync,true);
  assert.equal(restored.getSnapshot().data.movements[0].motivo,'Venta de mostrador');
  assert.equal(JSON.parse(storage.getItem(CACHE_KEYS.sales)!)[0].id,sale.id);
  const replayed=projectCommand({...base,inventory:[{...item,precioVenta:99999}]},{kind:'sale',sale});
  assert.equal(replayed.sales[0].total,sale.total);
  await assert.rejects(store.submit({kind:'sale',sale}),/ya está registrada/);
  await assert.rejects(store.submit({kind:'sale',sale:{...sale,id:crypto.randomUUID(),cantidad:4}}),/Sin existencias/);
  await assert.rejects(store.submit({kind:'sale',sale:{...sale,id:crypto.randomUUID(),precioUnitario:0}}),/precio cambió/);
});
