import { CHECKLIST_BY_CATEGORY, type DeviceCategory, type OrderStatus } from '../types';
import { supabase } from './supabase';

/** Public contract. Never return a raw order, client or workshop configuration. */
export interface PublicOrderTracking {
  id: string;
  estado: OrderStatus;
  dispositivo: { marca: string; modelo: string; categoria: DeviceCategory };
  fallaDeclarada: string;
  fotosEvidencia: string[];
  costoManoObra: number;
  totalEstimado: number;
  garantiaDias: number;
  fechaEntrega: string | null;
  clienteTelefonoMascara: string;
  repuestos: { nombre: string; cantidad: number; precioUnitario: number }[];
  taller: { nombre: string; telefono: string; politicaGarantiaTexto: string; simboloMoneda: string };
}

const ORDER_STATUSES: OrderStatus[] = ['Recibido', 'En Diagnóstico', 'Esperando Presupuesto', 'Esperando Repuesto', 'En Reparación', 'Listo', 'Entregado', 'Garantía'];
const invalidResponse = () => new Error('El seguimiento no está disponible en este momento. Intenta actualizar más tarde.');
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const nonNegativeNumber = (value: unknown) => {
  if (typeof value !== 'number' && typeof value !== 'string') return 0;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};

export function isValidTrackingOrderId(value: string): boolean {
  return value.length <= 64 && /^OS-[0-9]+(-G[0-9]+)?$/.exec(value)?.[0] === value;
}

function publicPhotoUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (/^data:image\/webp;base64,[a-z0-9+/=\s]+$/i.test(value)) return value;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/** Rebuild every nested object from an explicit allowlist, even for mock data. */
export function parsePublicOrderTracking(value: unknown): PublicOrderTracking | null {
  if (value == null) return null;
  const row = asRecord(value);
  const id = text(row.id);
  const status = row.estado as OrderStatus;
  if (!isValidTrackingOrderId(id) || !ORDER_STATUSES.includes(status)) throw invalidResponse();
  const device = asRecord(row.dispositivo);
  const workshop = asRecord(row.taller);
  const category = text(device.categoria);
  const phoneDigits = text(row.clienteTelefonoMascara).replace(/\D/g, '');
  const deliveredAt = text(row.fechaEntrega);

  return {
    id,
    estado: status,
    dispositivo: {
      marca: text(device.marca),
      modelo: text(device.modelo),
      categoria: Object.hasOwn(CHECKLIST_BY_CATEGORY, category) ? category as DeviceCategory : 'Smartphone',
    },
    fallaDeclarada: text(row.fallaDeclarada),
    fotosEvidencia: Array.isArray(row.fotosEvidencia) ? row.fotosEvidencia.map(publicPhotoUrl).filter((url): url is string => url !== null) : [],
    costoManoObra: nonNegativeNumber(row.costoManoObra),
    totalEstimado: nonNegativeNumber(row.totalEstimado),
    garantiaDias: Math.floor(nonNegativeNumber(row.garantiaDias)),
    fechaEntrega: deliveredAt && Number.isFinite(Date.parse(deliveredAt)) ? deliveredAt : null,
    // Do not trust a server/mock field to already be masked.
    clienteTelefonoMascara: phoneDigits.length >= 4 ? `***-***-${phoneDigits.slice(-4)}` : 'Sin teléfono',
    repuestos: Array.isArray(row.repuestos) ? row.repuestos.map((value) => {
      const part = asRecord(value);
      return { nombre: text(part.nombre, 'Repuesto'), cantidad: nonNegativeNumber(part.cantidad), precioUnitario: nonNegativeNumber(part.precioUnitario) };
    }) : [],
    taller: {
      nombre: text(workshop.nombre).trim() || 'CelMart',
      telefono: text(workshop.telefono),
      politicaGarantiaTexto: text(workshop.politicaGarantiaTexto),
      simboloMoneda: text(workshop.simboloMoneda).trim() || '$',
    },
  };
}

interface TrackingRpcResult { data: unknown; error: unknown }
interface TrackingRpcQuery extends PromiseLike<TrackingRpcResult> {
  abortSignal?: (signal: AbortSignal) => TrackingRpcQuery;
}
interface TrackingRpcClient {
  rpc: (name: string, args: Record<string, unknown>) => TrackingRpcQuery;
}

/** Only the sanitized RPC is permitted on the public page; never query tables. */
export async function fetchPublicOrderTracking(
  orderId: string,
  database: TrackingRpcClient = supabase,
  signal?: AbortSignal,
): Promise<PublicOrderTracking | null> {
  if (!isValidTrackingOrderId(orderId)) return null;
  if (signal?.aborted) throw new DOMException('Consulta cancelada', 'AbortError');
  let query = database.rpc('get_order_tracking', { p_order_id: orderId });
  if (signal && query.abortSignal) query = query.abortSignal(signal);
  let result: TrackingRpcResult;
  if (signal) {
    let abort: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      abort = () => reject(new DOMException('Consulta cancelada', 'AbortError'));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
    try {
      result = await Promise.race([Promise.resolve(query), aborted]);
    } finally {
      signal.removeEventListener('abort', abort);
    }
  } else {
    result = await query;
  }
  if (result.error) throw new Error('No pudimos consultar el seguimiento. Intenta actualizar en unos momentos.');
  const order = parsePublicOrderTracking(result.data);
  if (order && order.id !== orderId) throw invalidResponse();
  return order;
}

/** Five visible stages; holds and warranty reviews do not imply completion. */
export function getTrackingProgress(status: OrderStatus): { step: number; title: string; description: string; hold: boolean } {
  switch (status) {
    case 'Recibido': return { step: 0, title: 'Tu equipo ya está en el taller', description: 'Registramos tu equipo y estamos preparando su revisión.', hold: false };
    case 'En Diagnóstico': return { step: 1, title: 'Estamos revisando tu equipo', description: 'El técnico está identificando la falla y la reparación necesaria.', hold: false };
    case 'Esperando Presupuesto': return { step: 1, title: 'Pendiente de presupuesto o aprobación', description: 'Contacta al taller para revisar el presupuesto y autorizar el siguiente paso.', hold: true };
    case 'Esperando Repuesto': return { step: 2, title: 'Estamos esperando un repuesto', description: 'La reparación está en pausa hasta recibir la pieza necesaria.', hold: true };
    case 'En Reparación': return { step: 2, title: 'Tu equipo está en reparación', description: 'Estamos trabajando en la reparación y las pruebas de funcionamiento.', hold: false };
    case 'Listo': return { step: 3, title: '¡Tu equipo está listo!', description: 'Puedes comunicarte con el taller para coordinar la entrega.', hold: false };
    case 'Entregado': return { step: 4, title: 'Equipo entregado', description: 'Gracias por confiar en nosotros para reparar tu equipo.', hold: false };
    case 'Garantía': return { step: 1, title: 'Revisión en garantía', description: 'Estamos revisando tu equipo bajo garantía. Aquí verás el avance de esta revisión.', hold: true };
  }
}
