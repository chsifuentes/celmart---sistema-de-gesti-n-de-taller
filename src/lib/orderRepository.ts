import { CHECKLIST_BY_CATEGORY, type DeviceCategory, type InventoryItem, type Order } from '../types';
import { supabase } from './supabase';

// Keep the database representation at this boundary, including pre-migration nulls.
export function mapOrderRow(row: Record<string, any>): Order {
  const category: DeviceCategory = Object.hasOwn(CHECKLIST_BY_CATEGORY, row.categoria_dispositivo)
    ? row.categoria_dispositivo : 'Smartphone';
  const checklist = row.checklist_json && typeof row.checklist_json === 'object' && !Array.isArray(row.checklist_json)
    ? Object.fromEntries(Object.entries(row.checklist_json).filter(([, value]) => typeof value === 'boolean'))
    : {};
  return {
    id: row.id,
    prioridadUrgente: row.prioridad_urgente ?? false,
    cliente: { nombre: row.cliente_nombre ?? '', telefono: row.cliente_telefono ?? '', email: row.cliente_email ?? undefined },
    dispositivo: {
      categoria: category,
      marca: row.dispositivo_marca ?? '', modelo: row.dispositivo_modelo ?? '',
      imei: row.dispositivo_imei ?? '', color: row.dispositivo_color ?? undefined,
      claveBloqueo: row.dispositivo_clave ?? undefined,
    },
    estado: row.estado,
    tecnico: row.tecnico_nombre ? { nombre: row.tecnico_nombre, iniciales: row.tecnico_iniciales || 'TC' } : null,
    ingreso: row.ingreso ?? '',
    fallaDeclarada: row.falla_declarada ?? '',
    preDiagnostico: row.pre_diagnostico ?? undefined,
    observacionesFisicas: row.observaciones_fisicas ?? '',
    // Missing legacy checks mean "unverified", never an invented successful test.
    checklist: { equipoApagado: row.equipo_apagado ?? undefined, ...checklist },
    notasTecnicas: Array.isArray(row.notas_tecnicas) ? row.notas_tecnicas : [],
    repuestosAsignados: Array.isArray(row.repuestos_asignados) ? row.repuestos_asignados : [],
    fotosEvidencia: Array.isArray(row.fotos_evidencia) ? row.fotos_evidencia.filter((url: unknown) => typeof url === 'string') : [],
    costoManoObra: Number(row.costo_mano_obra ?? 0),
    totalEstimado: Number(row.total_estimado ?? 0),
    garantiaDias: row.garantia_dias ?? 30,
  };
}

export function orderToRow(order: Order) {
  return {
    id: order.id, prioridad_urgente: order.prioridadUrgente ?? false,
    cliente_nombre: order.cliente.nombre, cliente_telefono: order.cliente.telefono, cliente_email: order.cliente.email,
    categoria_dispositivo: order.dispositivo.categoria ?? 'Smartphone',
    dispositivo_marca: order.dispositivo.marca, dispositivo_modelo: order.dispositivo.modelo,
    dispositivo_imei: order.dispositivo.imei, dispositivo_color: order.dispositivo.color,
    dispositivo_clave: order.dispositivo.claveBloqueo,
    estado: order.estado, tecnico_nombre: order.tecnico?.nombre, tecnico_iniciales: order.tecnico?.iniciales,
    ingreso: order.ingreso, falla_declarada: order.fallaDeclarada, pre_diagnostico: order.preDiagnostico,
    observaciones_fisicas: order.observacionesFisicas, equipo_apagado: order.checklist.equipoApagado,
    checklist_json: order.checklist, notas_tecnicas: order.notasTecnicas,
    repuestos_asignados: order.repuestosAsignados, fotos_evidencia: order.fotosEvidencia ?? [],
    costo_mano_obra: order.costoManoObra, total_estimado: order.totalEstimado, garantia_dias: order.garantiaDias,
  };
}

export function mapInventoryRow(row: Record<string, any>): InventoryItem {
  return {
    id: row.id, nombre: row.nombre, sku: row.sku, categoria: row.categoria,
    stockActual: Number(row.stock_actual ?? 0), stockMinimo: Number(row.stock_minimo ?? 0),
    costoCompra: Number(row.costo_compra ?? 0), precioVenta: Number(row.precio_venta ?? 0),
    compatibilidad: row.compatibilidad ?? '', ubicacion: row.ubicacion ?? '', imagenUrl: row.imagen_url ?? undefined,
  };
}

export async function getNextOrderNumber(database = supabase): Promise<number> {
  let highest = 2400;
  // Supabase limits each response; paging also handles folios beyond OS-9999.
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await database.from('ordenes').select('id')
      .order('id', { ascending: true }).range(offset, offset + 999);
    if (error) throw new Error(`No se pudo consultar el siguiente folio: ${error.message}`);
    for (const row of data ?? []) {
      const match = /^OS-(\d+)$/.exec(row.id);
      if (match) highest = Math.max(highest, Number(match[1]));
    }
    if (!data || data.length < 1000) return highest + 1;
  }
}

type MutableColumn = 'notas_tecnicas' | 'repuestos_asignados' | 'fotos_evidencia' | 'costo_mano_obra' | 'total_estimado';

function filterValue(column: MutableColumn, value: unknown) {
  if (column === 'fotos_evidencia' && Array.isArray(value)) {
    // PostgreSQL array literal; quote/escape each element (including offline DataURLs).
    return `{${value.map((url: string) => `"${url.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;
  }
  return typeof value === 'object' ? JSON.stringify(value) : value;
}

/** Compare-and-swap prevents simultaneous phones from overwriting array appends. */
export async function updateOrderWithRetry(
  orderId: string,
  watchedColumns: MutableColumn[],
  changes: (current: Order) => Record<string, unknown>,
  database = supabase,
): Promise<Order> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: row, error: readError } = await database.from('ordenes').select('*').eq('id', orderId).maybeSingle();
    if (readError) throw new Error(`No se pudo leer la orden: ${readError.message}`);
    if (!row) throw new Error('La orden ya no existe o no tienes permiso para consultarla.');
    let query = database.from('ordenes').update(changes(mapOrderRow(row))).eq('id', orderId);
    for (const column of watchedColumns) {
      query = row[column] == null ? query.is(column, null) : query.eq(column, filterValue(column, row[column]));
    }
    const { data: updated, error } = await query.select('*').maybeSingle();
    if (error) throw new Error(`No se pudo guardar la orden: ${error.message}`);
    if (updated) return mapOrderRow(updated);
  }
  throw new Error('La orden cambió mientras guardabas. Intenta guardar de nuevo.');
}
