import type { Order } from '../types';
export function assignedTo(order: Order, technician: string): boolean {
  const normalize = (value: string) =>
    value.trim().normalize('NFC').toLocaleLowerCase('es-MX');
  return (
    !!technician.trim() &&
    normalize(order.tecnico?.nombre || '') === normalize(technician)
  );
}
export function orderTiming(
  order: Order,
  now = new Date()
): { label: string; stale: boolean; statusUnknown: boolean } {
  const age = order.fechaIngreso
    ? now.getTime() - Date.parse(order.fechaIngreso)
    : NaN;
  const statusAge = order.estadoActualizadoAt
    ? now.getTime() - Date.parse(order.estadoActualizadoAt)
    : NaN;
  const hours = Math.floor(Math.max(0, age) / 3600000);
  const label = !Number.isFinite(age)
    ? 'Ingreso sin fecha verificable'
    : hours >= 24
      ? `Ingresó hace ${Math.floor(hours / 24)} días`
      : hours >= 1
        ? `Ingresó hace ${hours}h`
        : 'Ingresó hace menos de 1h';
  return {
    label,
    stale:
      Number.isFinite(statusAge) &&
      statusAge > 48 * 3600000 &&
      order.estado !== 'Entregado',
    statusUnknown: !Number.isFinite(statusAge),
  };
}
