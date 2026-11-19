import type { Order, OrderStatus, PaymentMethod } from '../types';

export type { PaymentMethod } from '../types';
export const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Tarjeta'] as const satisfies readonly PaymentMethod[];

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return PAYMENT_METHODS.some((method) => method === value);
}

// Operational corrections remain available. Warranty creates a new linked order
// instead of reopening the delivered parent.
const operationalStates = [
  'Recibido',
  'En Diagnóstico',
  'Esperando Presupuesto',
  'Esperando Repuesto',
  'En Reparación',
  'Listo',
] as const satisfies readonly OrderStatus[];

export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  Recibido: operationalStates.filter((status) => status !== 'Recibido'),
  'En Diagnóstico': operationalStates.filter((status) => status !== 'En Diagnóstico'),
  'Esperando Presupuesto': operationalStates.filter((status) => status !== 'Esperando Presupuesto'),
  'Esperando Repuesto': operationalStates.filter((status) => status !== 'Esperando Repuesto'),
  'En Reparación': operationalStates.filter((status) => status !== 'En Reparación'),
  Listo: [...operationalStates.filter((status) => status !== 'Listo'), 'Entregado'],
  Entregado: [],
  Garantía: operationalStates,
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return Object.hasOwn(ORDER_TRANSITIONS, from) && ORDER_TRANSITIONS[from].includes(to);
}

export function canAssignPart(order: Pick<Order, 'estado'> | OrderStatus): boolean {
  const status = typeof order === 'string' ? order : order.estado;
  return Object.hasOwn(ORDER_TRANSITIONS, status) && status !== 'Entregado';
}
export function workshopDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function warrantyActive(order: Order, now = new Date()): boolean {
  if (!order.fechaEntrega || !Number.isFinite(Date.parse(order.fechaEntrega))) return false;
  const elapsed = now.getTime() - Date.parse(order.fechaEntrega);
  return order.estado === 'Entregado' && elapsed >= 0 && elapsed < order.garantiaDias * 86400000;
}
export interface CashSummary { fecha: string; total_efectivo: number; total_transferencia: number; total_tarjeta: number; gastos_repuestos: number; sin_metodo: number }
export interface CashClose extends CashSummary { id: string; monto_apertura: number; total_neto: number; cerrado_por: string; observaciones: string; created_at: string }
export function cashNet(opening: number, summary: CashSummary): number {
  return Math.round((opening + summary.total_efectivo + summary.total_transferencia + (summary.total_tarjeta ?? 0) - summary.gastos_repuestos) * 100) / 100;
}
