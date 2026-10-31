import { useCallback, useSyncExternalStore } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { supabase } from './supabase';
import { mapInventoryRow, mapOrderRow, orderToRow } from './orderRepository';
import {
  browserOnline,
  createOfflineSync,
  withNetworkDeadline,
  type OfflineCommand,
  type PendingOperation,
  type SyncResult,
  type WorkshopSnapshot,
} from './offlineSync';
import type { Client, InventoryItem, InventoryMovement } from '../types';

function browserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined;
  }
}
const storage = browserStorage();
const IDENTITY_KEY = 'celmart_offline_identity';
const LOCKED_KEY = 'celmart_session_locked';
export function readOfflineIdentity(): string | null {
  try {
    if (storage?.getItem(LOCKED_KEY)) return null;
    const value: unknown = JSON.parse(storage?.getItem(IDENTITY_KEY) || 'null');
    return value &&
      typeof value === 'object' &&
      typeof (value as { userId?: unknown }).userId === 'string'
      ? (value as { userId: string }).userId
      : null;
  } catch {
    return null;
  }
}
export function rememberOfflineIdentity(userId: string) {
  storage?.setItem(IDENTITY_KEY, JSON.stringify({ userId }));
  if (storage && 'removeItem' in storage)
    (storage as Storage).removeItem(LOCKED_KEY);
}
export function lockOfflineSession() {
  storage?.setItem(LOCKED_KEY, '1');
  if (storage && 'removeItem' in storage)
    (storage as Storage).removeItem(IDENTITY_KEY);
}
export function sessionLocked(): boolean {
  return !!storage?.getItem(LOCKED_KEY);
}
export function mapClientRow(row: Record<string, unknown>): Client {
  return {
    id: String(row.id),
    nombre: String(row.nombre || ''),
    telefono: String(row.telefono || ''),
    email: String(row.email || ''),
    reparacionesRealizadas: Number(row.reparaciones_realizadas || 0),
    saldoPendiente: Number(row.saldo_pendiente || 0),
    ultimaVisita: String(row.ultima_visita || 'Hoy'),
    dispositivosFrecuentes: ['Móvil'],
  };
}
export function mapMovementRow(
  row: Record<string, unknown>
): InventoryMovement {
  return {
    id: String(row.id),
    repuestoNombre: String(row.repuesto_nombre || row.repuestoNombre || ''),
    codigoOrden:
      typeof row.codigo_orden === 'string' ? row.codigo_orden : undefined,
    tipo: row.tipo as InventoryMovement['tipo'],
    cantidad: Number(row.cantidad),
    autor: String(row.autor || 'Taller'),
    tiempo: String(row.tiempo || 'Reciente'),
  };
}
export function inventoryToRow(item: InventoryItem) {
  return {
    id: item.id,
    nombre: item.nombre,
    sku: item.sku,
    categoria: item.categoria,
    stock_actual: item.stockActual,
    stock_minimo: item.stockMinimo,
    costo_compra: item.costoCompra,
    precio_venta: item.precioVenta,
    compatibilidad: item.compatibilidad,
    ubicacion: item.ubicacion,
    imagen_url: item.imagenUrl || null,
  };
}
export const withSyncTimeout = withNetworkDeadline;
export async function resolvePendingPhoto(
  url: string,
  folder: 'ordenes' | 'inventario',
  operationId: string,
  index: number
): Promise<string> {
  if (!url.startsWith('data:')) return url;
  const match = /^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if (!match) throw new Error('La foto pendiente no es un WebP válido.');
  const bytes = Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0));
  const path = `${folder}/offline-${operationId}-${index}.webp`;
  const { error } = await withSyncTimeout<{ error: unknown }>(() =>
    supabase.storage
      .from('taller-media')
      .upload(path, new Blob([bytes], { type: 'image/webp' }), {
        contentType: 'image/webp',
        upsert: true,
        cacheControl: '31536000',
      })
  );
  if (error) throw error;
  const { data } = supabase.storage.from('taller-media').getPublicUrl(path);
  if (!data.publicUrl) throw new Error('No se recibió la URL de la foto.');
  return data.publicUrl;
}
export async function encodeSyncCommand(
  operation: PendingOperation
): Promise<Record<string, unknown>> {
  const command = operation.command;
  if (command.kind === 'createOrder') {
    const photos: string[] = [];
    for (const [index, url] of (command.order.fotosEvidencia || []).entries())
      photos.push(
        await resolvePendingPhoto(url, 'ordenes', operation.id, index)
      );
    return {
      kind: command.kind,
      row: {
        ...orderToRow(command.order),
        created_at: command.order.fechaIngreso,
      },
      photos,
    };
  }
  if (command.kind === 'photo')
    return {
      ...command,
      url: await resolvePendingPhoto(command.url, 'ordenes', operation.id, 0),
    };
  if (command.kind === 'createInventory' || command.kind === 'editInventory') {
    const row = inventoryToRow(command.item);
    if (row.imagen_url)
      row.imagen_url = await resolvePendingPhoto(
        row.imagen_url,
        'inventario',
        operation.id,
        0
      );
    return {
      kind: command.kind,
      row,
      previousStock:
        command.kind === 'editInventory' ? command.previousStock : undefined,
    };
  }
  if (command.kind === 'createClient')
    return {
      kind: command.kind,
      row: {
        id: command.client.id,
        nombre: command.client.nombre,
        telefono: command.client.telefono,
        email: command.client.email,
      },
    };
  return { ...command };
}
async function send(operation: PendingOperation): Promise<SyncResult> {
  const command = await encodeSyncCommand(operation);
  const response = await withSyncTimeout<{
    data: unknown;
    error: unknown;
    status?: number;
  }>((signal) => {
    const query = supabase.rpc('apply_offline_operation', {
      p_operation_id: operation.id,
      p_owner_id: operation.ownerId,
      p_command: command,
    });
    return 'abortSignal' in query
      ? (
          query as typeof query & {
            abortSignal(signal: AbortSignal): typeof query;
          }
        ).abortSignal(signal)
      : query;
  });
  if (response.error)
    throw Object.assign(
      new Error(
        String(
          (response.error as { message?: unknown }).message ||
            'No se confirmó el cambio del servidor.'
        )
      ),
      { status: response.status }
    );
  const data = response.data as {
    orders?: Record<string, unknown>[];
    inventory?: Record<string, unknown>[];
    clients?: Record<string, unknown>[];
    movements?: Record<string, unknown>[];
    replayed?: boolean;
  } | null;
  if (!data) throw new Error('No se confirmó la operación del servidor.');
  const original = operation.command;
  const orderId =
    original.kind === 'createOrder'
      ? original.order.id
      : 'orderId' in original
        ? original.orderId
        : null;
  const itemId =
    original.kind === 'createInventory' || original.kind === 'editInventory'
      ? original.item.id
      : 'itemId' in original
        ? original.itemId
        : null;
  if (
    (orderId && !data.orders?.some((row) => row.id === orderId)) ||
    (itemId && !data.inventory?.some((row) => row.id === itemId)) ||
    (original.kind === 'createClient' &&
      !data.clients?.some((row) => row.id === original.client.id))
  )
    throw new Error(
      'El servidor no devolvió el registro confirmado. Se conserva el cambio en la cola.'
    );
  return {
    changes: {
      orders: data.orders?.map(mapOrderRow),
      inventory: data.inventory?.map(mapInventoryRow),
      clients: data.clients?.map(mapClientRow),
      movements: data.movements?.map(mapMovementRow),
    },
    replayed: data.replayed,
  };
}
const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
export const offlineStore = createOfflineSync({
  storage,
  online: browserOnline,
  send,
  ...(locks
    ? {
        lock: <T>(name: string, work: () => Promise<T>) =>
          locks.request(name, work),
      }
    : {}),
});
if (typeof window !== 'undefined')
  window.addEventListener('storage', (event) => {
    if (event.key === 'celmart_sync_queue') offlineStore.reload();
  });

/** The React view and its persistent mirrors share a single source of truth. */
export function useWorkshopField<K extends keyof WorkshopSnapshot>(
  key: K
): [WorkshopSnapshot[K], Dispatch<SetStateAction<WorkshopSnapshot[K]>>] {
  const state = useSyncExternalStore(
    offlineStore.subscribe,
    offlineStore.getSnapshot,
    offlineStore.getSnapshot
  );
  const setValue = useCallback(
    (next: SetStateAction<WorkshopSnapshot[K]>) => {
      const current = offlineStore.getSnapshot().data[key];
      const value =
        typeof next === 'function'
          ? (next as (value: WorkshopSnapshot[K]) => WorkshopSnapshot[K])(
              current
            )
          : next;
      void offlineStore
        .patchConfirmed({ [key]: value })
        .catch((error) => console.error('[CelMart] Caché:', error));
    },
    [key]
  );
  return [state.data[key], setValue];
}
export function uniqueOrderId(nextNumber: number): string {
  return `OS-${nextNumber}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}
