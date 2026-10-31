import type {
  AssignedPart,
  Client,
  InventoryItem,
  InventoryMovement,
  Order,
  OrderStatus,
  TechNote,
} from '../types';

export interface WorkshopSnapshot {
  orders: Order[];
  inventory: InventoryItem[];
  clients: Client[];
  movements: InventoryMovement[];
}
export type OfflineCommand =
  | { kind: 'createOrder'; order: Order }
  | {
      kind: 'status';
      orderId: string;
      from: OrderStatus;
      to: OrderStatus;
      at: string;
    }
  | { kind: 'note'; orderId: string; note: TechNote }
  | { kind: 'location'; orderId: string; value: string }
  | { kind: 'photo'; orderId: string; url: string }
  | {
      kind: 'payment';
      orderId: string;
      method: 'Efectivo' | 'Transferencia';
      amount: number;
    }
  | { kind: 'assignPart'; orderId: string; part: AssignedPart; itemId: string }
  | {
      kind: 'stock';
      itemId: string;
      delta: number;
      movement: InventoryMovement;
    }
  | { kind: 'createInventory'; item: InventoryItem }
  | { kind: 'editInventory'; item: InventoryItem; previousStock: number }
  | { kind: 'createClient'; client: Client };
export interface PendingOperation {
  id: string;
  ownerId: string;
  createdAt: string;
  command: OfflineCommand;
  error?: string;
}
export interface SyncResult {
  changes: Partial<WorkshopSnapshot>;
  replayed?: boolean;
}
export const QUEUE_KEY = 'celmart_sync_queue';
export const CACHE_KEYS = {
  orders: 'celmart_cache_orders',
  inventory: 'celmart_cache_inventory',
  clients: 'celmart_cache_clients',
  movements: 'celmart_cache_movements',
} as const;
const EMPTY: WorkshopSnapshot = {
  orders: [],
  inventory: [],
  clients: [],
  movements: [],
};
interface Journal {
  version: 1;
  ownerId: string | null;
  base: WorkshopSnapshot;
  queue: PendingOperation[];
}
export interface SyncState {
  data: WorkshopSnapshot;
  pending: number;
  syncing: boolean;
  offline: boolean;
  error: string | null;
  ownerId: string | null;
  canDiscard: boolean;
}
export interface SyncStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
interface Options {
  storage?: SyncStorage;
  online: () => boolean;
  send: (operation: PendingOperation) => Promise<SyncResult>;
  lock?: <T>(name: string, work: () => Promise<T>) => Promise<T>;
}
export function browserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}
export async function withNetworkDeadline<T>(
  work: (signal: AbortSignal) => PromiseLike<T>,
  ms = 8000
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new DOMException(
          'Sin respuesta de red; el cambio queda guardado localmente.',
          'TimeoutError'
        )
      );
    }, ms);
  });
  try {
    return await Promise.race([
      Promise.resolve(work(controller.signal)),
      deadline,
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
export function isNetworkError(error: unknown): boolean {
  const e = error as {
    name?: string;
    message?: string;
    code?: string;
    status?: number;
  } | null;
  return (
    ['AbortError', 'TimeoutError'].includes(e?.name || '') ||
    e?.status === 0 ||
    e?.status === 429 ||
    (typeof e?.status === 'number' && e.status >= 500) ||
    /fetch|network|failed to load|load failed|internet|timed? ?out|offline/i.test(
      e?.message || ''
    )
  );
}
export function readArrayCache<T>(
  storage: SyncStorage | undefined,
  key: string
): T[] {
  try {
    const data: unknown = JSON.parse(storage?.getItem(key) || 'null');
    const field = (Object.keys(CACHE_KEYS) as (keyof WorkshopSnapshot)[]).find(
      (field) => CACHE_KEYS[field] === key
    );
    return Array.isArray(data)
      ? (data.filter((value) =>
          field
            ? validCacheRow(field, value)
            : value && typeof value === 'object' && typeof value.id === 'string'
        ) as T[])
      : [];
  } catch {
    return [];
  }
}
function validCacheRow(key: keyof WorkshopSnapshot, value: unknown): boolean {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as { id?: unknown }).id !== 'string'
  )
    return false;
  const row = value as Record<string, unknown>;
  const strings = (keys: string[]) =>
    keys.every((key) => typeof row[key] === 'string');
  const numbers = (keys: string[]) =>
    keys.every(
      (key) => typeof row[key] === 'number' && Number.isFinite(row[key])
    );
  if (key === 'orders') {
    const order = value as Order;
    return (
      !!order.cliente &&
      typeof order.cliente.nombre === 'string' &&
      typeof order.cliente.telefono === 'string' &&
      !!order.dispositivo &&
      typeof order.dispositivo.modelo === 'string' &&
      typeof order.dispositivo.marca === 'string' &&
      typeof order.dispositivo.imei === 'string' &&
      Array.isArray(order.notasTecnicas) &&
      Array.isArray(order.repuestosAsignados) &&
      !!order.checklist &&
      numbers(['costoManoObra', 'totalEstimado', 'garantiaDias']) &&
      strings(['estado', 'ingreso', 'fallaDeclarada'])
    );
  }
  if (key === 'inventory')
    return (
      strings(['nombre', 'sku', 'categoria', 'compatibilidad', 'ubicacion']) &&
      numbers(['stockActual', 'stockMinimo', 'costoCompra', 'precioVenta'])
    );
  if (key === 'clients')
    return (
      strings(['nombre', 'telefono', 'email', 'ultimaVisita']) &&
      numbers(['reparacionesRealizadas', 'saldoPendiente']) &&
      Array.isArray(row.dispositivosFrecuentes)
    );
  return (
    strings(['repuestoNombre', 'tipo', 'autor', 'tiempo']) &&
    numbers(['cantidad'])
  );
}
function validSnapshot(value: unknown): value is WorkshopSnapshot {
  return (
    !!value &&
    typeof value === 'object' &&
    (Object.keys(EMPTY) as (keyof WorkshopSnapshot)[]).every(
      (key) =>
        Array.isArray((value as WorkshopSnapshot)[key]) &&
        (value as WorkshopSnapshot)[key].every((row) => validCacheRow(key, row))
    )
  );
}
function upsert<T extends { id: string }>(rows: T[], row: T): T[] {
  return rows.some((item) => item.id === row.id)
    ? rows.map((item) => (item.id === row.id ? row : item))
    : [row, ...rows];
}
export function mergeSnapshot(
  base: WorkshopSnapshot,
  changes: Partial<WorkshopSnapshot>
): WorkshopSnapshot {
  const result = { ...base };
  for (const key of Object.keys(EMPTY) as (keyof WorkshopSnapshot)[]) {
    if (changes[key])
      (result[key] as { id: string }[]) = changes[key]!.reduce(
        (rows, row) => upsert(rows, row),
        base[key] as { id: string }[]
      );
  }
  return result;
}
/** Replay semantic changes; never overwrite an entire remote notes/parts array. */
export function projectCommand(
  base: WorkshopSnapshot,
  command: OfflineCommand,
  strict = false
): WorkshopSnapshot {
  const result = { ...base };
  const editOrder = (change: (order: Order) => Order) => {
    if (!('orderId' in command)) return;
    const order = result.orders.find((item) => item.id === command.orderId);
    if (!order) {
      if (strict)
        throw new Error('La orden no está disponible en este dispositivo.');
      return;
    }
    result.orders = upsert(result.orders, change(order));
  };
  switch (command.kind) {
    case 'createOrder':
      if (
        strict &&
        (!validCacheRow('orders', command.order) ||
          command.order.costoManoObra < 0 ||
          !Number.isInteger(command.order.garantiaDias) ||
          command.order.garantiaDias < 0)
      )
        throw new Error(
          'Revisa los datos y el presupuesto de la recepción antes de guardar.'
        );
      if (strict && base.orders.some((order) => order.id === command.order.id))
        throw new Error('El folio ya existe.');
      result.orders = upsert(base.orders, command.order);
      break;
    case 'status':
      editOrder((order) => {
        if (strict && order.estado === 'Entregado')
          throw new Error(
            'La entrega original se conserva. Usa el reingreso por garantía.'
          );
        if (
          strict &&
          command.to === 'Entregado' &&
          (order.estado !== 'Listo' ||
            !order.metodoPago ||
            order.montoCobrado == null)
        )
          throw new Error(
            'Antes de entregar, marca Listo y registra el cobro.'
          );
        return {
          ...order,
          estado: command.to,
          estadoActualizadoAt: command.at,
          ...(command.to === 'Entregado'
            ? { fechaEntrega: order.fechaEntrega || command.at }
            : {}),
        };
      });
      break;
    case 'note':
      editOrder((order) => ({
        ...order,
        notasTecnicas: [
          command.note,
          ...order.notasTecnicas.filter((note) => note.id !== command.note.id),
        ],
      }));
      break;
    case 'location':
      if (strict && (!command.value.trim() || command.value.length > 120))
        throw new Error('Indica una ubicación de hasta 120 caracteres.');
      editOrder((order) => ({ ...order, ubicacionFisica: command.value }));
      break;
    case 'photo':
      editOrder((order) => ({
        ...order,
        fotosEvidencia: [
          ...new Set([...(order.fotosEvidencia || []), command.url]),
        ],
      }));
      break;
    case 'payment':
      if (strict && (!Number.isFinite(command.amount) || command.amount < 0))
        throw new Error('Importe inválido.');
      editOrder((order) => ({
        ...order,
        metodoPago: command.method,
        montoCobrado: command.amount,
      }));
      break;
    case 'assignPart': {
      const item = result.inventory.find((item) => item.id === command.itemId);
      if (
        strict &&
        (!item ||
          !Number.isInteger(command.part.cantidad) ||
          command.part.cantidad <= 0 ||
          item.stockActual < command.part.cantidad)
      )
        throw new Error('Stock insuficiente o cantidad inválida.');
      if (item)
        result.inventory = upsert(result.inventory, {
          ...item,
          stockActual: Math.max(0, item.stockActual - command.part.cantidad),
        });
      editOrder((order) => {
        const parts = [
          ...order.repuestosAsignados.filter(
            (part) => part.id !== command.part.id
          ),
          command.part,
        ];
        return {
          ...order,
          repuestosAsignados: parts,
          totalEstimado:
            order.costoManoObra +
            parts.reduce(
              (sum, part) => sum + part.cantidad * part.precioUnitario,
              0
            ),
        };
      });
      break;
    }
    case 'stock': {
      const item = result.inventory.find((item) => item.id === command.itemId);
      if (
        strict &&
        (!item ||
          !Number.isInteger(command.delta) ||
          command.delta === 0 ||
          item.stockActual + command.delta < 0)
      )
        throw new Error('El stock no puede ser negativo.');
      if (item)
        result.inventory = upsert(result.inventory, {
          ...item,
          stockActual: Math.max(0, item.stockActual + command.delta),
        });
      result.movements = upsert(result.movements, command.movement);
      break;
    }
    case 'createInventory':
    case 'editInventory':
      if (
        strict &&
        (![command.item.stockActual, command.item.stockMinimo].every(
          (value) => Number.isInteger(value) && value >= 0
        ) ||
          ![command.item.costoCompra, command.item.precioVenta].every(
            (value) => Number.isFinite(value) && value >= 0
          ))
      )
        throw new Error('Revisa los importes y las cantidades del repuesto.');
      result.inventory = upsert(base.inventory, command.item);
      break;
    case 'createClient':
      result.clients = upsert(base.clients, command.client);
      break;
  }
  return result;
}

/** One atomic journal contains the confirmed base and durable FIFO commands.
 * The four requested mirror keys are derived caches, never the only copy of a write. */
export function createOfflineSync(options: Options) {
  const listeners = new Set<() => void>();
  let running: Promise<void> | null = null;
  let chain = Promise.resolve();
  let syncing = false,
    networkOffline = false,
    lastError: string | null = null,
    corrupt = false;
  const fallback = (): Journal => ({
    version: 1,
    ownerId: null,
    base: {
      orders: readArrayCache<Order>(options.storage, CACHE_KEYS.orders),
      inventory: readArrayCache<InventoryItem>(
        options.storage,
        CACHE_KEYS.inventory
      ),
      clients: readArrayCache<Client>(options.storage, CACHE_KEYS.clients),
      movements: readArrayCache<InventoryMovement>(
        options.storage,
        CACHE_KEYS.movements
      ),
    },
    queue: [],
  });
  function read(): Journal {
    const raw = options.storage?.getItem(QUEUE_KEY);
    if (!raw) return fallback();
    const data = JSON.parse(raw) as Journal;
    if (
      data.version !== 1 ||
      !validSnapshot(data.base) ||
      !Array.isArray(data.queue) ||
      !data.queue.every(
        (op) =>
          typeof op.id === 'string' &&
          typeof op.ownerId === 'string' &&
          !!op.command?.kind
      )
    )
      throw new Error(
        'La cola local no se pudo leer. No se sobrescribió; conserva los datos de este navegador.'
      );
    data.queue.reduce(
      (base, operation) => projectCommand(base, operation.command),
      data.base
    );
    return data;
  }
  let journal: Journal;
  try {
    journal = read();
  } catch {
    journal = fallback();
    corrupt = true;
    lastError =
      'La cola local no se pudo leer. No se sobrescribió; conserva los datos de este navegador.';
  }
  const projected = () =>
    journal.queue.reduce(
      (data, operation) => projectCommand(data, operation.command),
      journal.base
    );
  let state: SyncState = {
    data: projected(),
    pending: journal.queue.length,
    syncing,
    offline: !options.online(),
    error: lastError,
    ownerId: journal.ownerId,
    canDiscard: !!journal.queue[0]?.error,
  };
  function emit() {
    state = {
      data: projected(),
      pending: journal.queue.length,
      syncing,
      offline: !options.online() || networkOffline,
      error: lastError || journal.queue[0]?.error || null,
      ownerId: journal.ownerId,
      canDiscard: !!journal.queue[0]?.error && !syncing,
    };
    for (const listener of listeners) listener();
  }
  function save(next: Journal) {
    if (!options.storage)
      throw new Error(
        'Este navegador no permite guardar cambios sin conexión.'
      );
    try {
      options.storage.setItem(QUEUE_KEY, JSON.stringify(next));
    } catch {
      throw new Error(
        'El almacenamiento local está lleno o bloqueado. El cambio no se guardó; libera espacio antes de continuar.'
      );
    }
    journal = next;
    const data = projected();
    for (const key of Object.keys(CACHE_KEYS) as (keyof WorkshopSnapshot)[]) {
      try {
        options.storage.setItem(CACHE_KEYS[key], JSON.stringify(data[key]));
      } catch {
        /* The authoritative atomic journal remains durable. */
      }
    }
    emit();
  }
  async function locked<T>(name: string, work: () => Promise<T>): Promise<T> {
    if (options.lock) return options.lock(name, work);
    if (name === 'celmart-sync-drain') return work();
    const previous = chain;
    let release!: () => void;
    chain = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }
  async function update(change: (latest: Journal) => Journal) {
    return locked('celmart-sync-journal', async () => {
      if (corrupt) throw new Error(lastError || 'Cola local ilegible.');
      const latest = read();
      save(change(latest));
    });
  }
  const api = {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async bindOwner(ownerId: string) {
      const current = read();
      if (current.ownerId === ownerId) {
        journal = current;
        emit();
        return;
      }
      await update((latest) => {
        if (latest.ownerId && latest.ownerId !== ownerId) {
          if (latest.queue.length)
            throw new Error(
              'Hay cambios pendientes de otra cuenta. Inicia sesión con esa cuenta para sincronizarlos.'
            );
          return { version: 1, ownerId, base: { ...EMPTY }, queue: [] };
        }
        return { ...latest, ownerId };
      });
    },
    async replaceRemote(changes: Partial<WorkshopSnapshot>) {
      await update((latest) =>
        latest.queue.length
          ? latest
          : { ...latest, base: { ...latest.base, ...changes } }
      );
    },
    async patchConfirmed(changes: Partial<WorkshopSnapshot>) {
      await update((latest) => ({
        ...latest,
        base: { ...latest.base, ...changes },
      }));
    },
    async enqueue(command: OfflineCommand) {
      const id = crypto.randomUUID();
      await update((latest) => {
        if (!latest.ownerId)
          throw new Error('Inicia sesión antes de guardar cambios.');
        const local = latest.queue.reduce(
          (data, operation) => projectCommand(data, operation.command),
          latest.base
        );
        projectCommand(local, command, true);
        return {
          ...latest,
          queue: [
            ...latest.queue,
            {
              id,
              ownerId: latest.ownerId,
              createdAt: new Date().toISOString(),
              command,
            },
          ],
        };
      });
      return id;
    },
    async flush(retry = false): Promise<void> {
      if (corrupt) {
        emit();
        return;
      }
      if (running) return running;
      if (!state.pending) return;
      if (!options.online()) {
        emit();
        return;
      }
      running = locked('celmart-sync-drain', async () => {
        syncing = true;
        networkOffline = false;
        lastError = null;
        emit();
        try {
          while (options.online()) {
            journal = read();
            const operation = journal.queue[0];
            if (!operation || (operation.error && !retry)) break;
            try {
              const result = await options.send(operation);
              await update((latest) => ({
                ...latest,
                base: mergeSnapshot(latest.base, result.changes),
                queue: latest.queue.filter((item) => item.id !== operation.id),
              }));
            } catch (error) {
              const message =
                error && typeof error === 'object' && 'message' in error
                  ? String(error.message)
                  : 'No se pudo sincronizar el cambio.';
              if (isNetworkError(error)) {
                networkOffline = true;
                lastError = null;
              } else {
                lastError = message;
                try {
                  await update((latest) => ({
                    ...latest,
                    queue: latest.queue.map((item) =>
                      item.id === operation.id
                        ? { ...item, error: message }
                        : item
                    ),
                  }));
                } catch {
                  /* Keep the durable original operation if storage fills after server commit. */
                }
              }
              break;
            }
          }
        } catch (error) {
          lastError =
            error instanceof Error
              ? error.message
              : 'No se pudo leer la cola local. Se conservan los cambios.';
        } finally {
          syncing = false;
          emit();
        }
      });
      try {
        await running;
      } finally {
        running = null;
      }
    },
    async submit(command: OfflineCommand) {
      const id = await api.enqueue(command);
      if (options.online() && !networkOffline) await api.flush();
      return {
        id,
        pending: journal.queue.some((op) => op.id === id),
        data: state.data,
      };
    },
    /** Only an explicit user decision can discard a server-rejected operation.
     * Network ambiguity never enables this action. Remove dependent local writes
     * with a rejected creation so no orphan notes/stock operations are sent. */
    async discardRejected() {
      if (syncing) throw new Error('Espera a que termine la sincronización.');
      await update((latest) => {
        const failed = latest.queue[0];
        if (!failed?.error)
          throw new Error(
            'Sólo puedes descartar un cambio rechazado por el servidor.'
          );
        const command = failed.command;
        const dependent = (op: PendingOperation) => {
          if (op.id === failed.id) return true;
          if (command.kind === 'createOrder')
            return (
              'orderId' in op.command && op.command.orderId === command.order.id
            );
          if (command.kind === 'createInventory')
            return (
              ('itemId' in op.command &&
                op.command.itemId === command.item.id) ||
              (op.command.kind === 'editInventory' &&
                op.command.item.id === command.item.id)
            );
          return false;
        };
        lastError = null;
        return {
          ...latest,
          queue: latest.queue.filter((op) => !dependent(op)),
        };
      });
    },
    reload() {
      try {
        journal = read();
        corrupt = false;
        lastError = journal.queue[0]?.error || null;
        if (!journal.queue.length && options.online()) networkOffline = false;
        emit();
      } catch (error) {
        corrupt = true;
        lastError = (error as Error).message;
        emit();
      }
    },
    networkChanged() {
      if (!options.online()) networkOffline = true;
      else networkOffline = false;
      emit();
    },
    networkFailed() {
      networkOffline = true;
      emit();
    },
  };
  return api;
}
