import type { Order } from '../types';
export type ShiftRole = 'recepcion' | 'tecnico' | 'administrador';
export type PaymentMethod = 'Efectivo' | 'Transferencia';
export function workshopDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function warrantyActive(order: Order, now = new Date()): boolean {
  if (!order.fechaEntrega || !Number.isFinite(Date.parse(order.fechaEntrega))) return false;
  const elapsed = now.getTime() - Date.parse(order.fechaEntrega);
  return order.estado === 'Entregado' && elapsed >= 0 && elapsed < order.garantiaDias * 86400000;
}
export interface CashSummary { fecha: string; total_efectivo: number; total_transferencia: number; gastos_repuestos: number; sin_metodo: number }
export interface CashClose extends CashSummary { id: string; monto_apertura: number; total_neto: number; cerrado_por: string; observaciones: string; created_at: string }
export function cashNet(opening: number, summary: CashSummary): number {
  return Math.round((opening + summary.total_efectivo + summary.total_transferencia - summary.gastos_repuestos) * 100) / 100;
}
