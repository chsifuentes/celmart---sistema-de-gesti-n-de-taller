import { createClient } from '@supabase/supabase-js';
import { initialClients, initialInventoryItems, initialOrders } from '../data/initialData';
import { canTransitionOrder } from './operations';

const supabaseUrl = ((import.meta as any).env?.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = ((import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '').trim();

export function createMockSupabaseClient() {
  const authListeners=new Set<(event:string)=>void>();
  console.info('[CelMart] Supabase sin configurar: usando datos locales de demostración');
  const persistenceKey = 'celmart:mock-tables:v1';

  // In-memory tables seeded from initial workshop data
  const tables: Record<string, any[]> = {
    ordenes: initialOrders.map((o) => ({
      id: o.id,
      prioridad_urgente: o.prioridadUrgente,
      cliente_nombre: o.cliente.nombre,
      cliente_telefono: o.cliente.telefono,
      cliente_email: o.cliente.email,
      dispositivo_marca: o.dispositivo.marca,
      dispositivo_modelo: o.dispositivo.modelo,
      dispositivo_imei: o.dispositivo.imei,
      dispositivo_color: o.dispositivo.color,
      dispositivo_clave: o.dispositivo.claveBloqueo,
      categoria_dispositivo: o.dispositivo.categoria ?? 'Smartphone',
      estado: o.estado,
      tecnico_nombre: o.tecnico?.nombre,
      tecnico_iniciales: o.tecnico?.iniciales,
      ingreso: o.ingreso,
      falla_declarada: o.fallaDeclarada,
      pre_diagnostico: o.preDiagnostico,
      observaciones_fisicas: o.observacionesFisicas,
      equipo_apagado: o.checklist.equipoApagado,
      checklist_json: o.checklist,
      notas_tecnicas: o.notasTecnicas,
      repuestos_asignados: o.repuestosAsignados,
      fotos_evidencia: o.fotosEvidencia ?? [],
      costo_mano_obra: o.costoManoObra,
      total_estimado: o.totalEstimado,
      garantia_dias: o.garantiaDias,
      entregado_at: null,
      created_at: new Date().toISOString(),
    })),
    clientes: initialClients.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      telefono: c.telefono,
      email: c.email,
      reparaciones_realizadas: c.reparacionesRealizadas,
      saldo_pendiente: c.saldoPendiente,
      ultima_visita: c.ultimaVisita,
    })),
    inventario: initialInventoryItems.map((i) => ({
      id: i.id,
      nombre: i.nombre,
      sku: i.sku,
      categoria: i.categoria,
      stock_actual: i.stockActual,
      stock_minimo: i.stockMinimo,
      costo_compra: i.costoCompra,
      precio_venta: i.precioVenta,
      compatibilidad: i.compatibilidad,
      ubicacion: i.ubicacion,
      imagen_url: i.imagenUrl ?? null,
    })),
    tecnicos: [
      {
        id: 'tech-1',
        nombre: 'Carlos Mendoza',
        iniciales: 'CM',
        especialidad: 'Microelectrónica y Placas',
        estado: 'Disponible',
        ordenes_activas: 2,
        capacidad_maxima: 5,
        horas_promedio: 3.5,
        efectividad: 97.5,
        salario_fijo: 18000,
        avatar_bg: 'bg-blue-600',
      },
      {
        id: 'tech-2',
        nombre: 'Andrea Flores',
        iniciales: 'AF',
        especialidad: 'Pantallas y Baterías',
        estado: 'Ocupado',
        ordenes_activas: 4,
        capacidad_maxima: 5,
        horas_promedio: 1.8,
        efectividad: 99.1,
        salario_fijo: 17500,
        avatar_bg: 'bg-emerald-600',
      },
      {
        id: 'tech-3',
        nombre: 'Roberto Silva',
        iniciales: 'RS',
        especialidad: 'Diagnóstico y Software',
        estado: 'Disponible',
        ordenes_activas: 1,
        capacidad_maxima: 4,
        horas_promedio: 2.2,
        efectividad: 95.8,
        salario_fijo: 16000,
        avatar_bg: 'bg-purple-600',
      },
    ],
    movimientos_inventario: [],
    configuracion_taller: [],
    consumos_repuestos: [],
    devoluciones_repuestos: [],
    ventas_mostrador: [],
    cortes_caja: [],
  };

  type Change = { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; schema: string; table: string; new: any; old: any };
  type Listener = { type: string; filter: { event?: string; schema?: string; table?: string; filter?: string }; callback: (payload: any) => void };
  const channels = new Set<{ name: string; listeners: Listener[]; subscribed: boolean }>();
  let persistenceEnabled = true;
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
  const day = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
  const validPayment = (method: unknown, amount: unknown) =>
    ['Efectivo', 'Transferencia', 'Tarjeta'].includes(String(method)) &&
    typeof amount === 'number' && Number.isFinite(amount) && amount >= 0;
  const assertOrderUpdate = (previous: any, next: any) => {
    if (next.metodo_pago != null && !['Efectivo', 'Transferencia', 'Tarjeta'].includes(next.metodo_pago)) throw new Error('Método de pago inválido');
    if (next.monto_cobrado != null && (!Number.isFinite(Number(next.monto_cobrado)) || Number(next.monto_cobrado) < 0)) throw new Error('Importe de cobro inválido');
    if (!previous) return;
    if (previous.estado === 'Entregado') {
      if (next.estado !== previous.estado) throw new Error('La entrega original se conserva. Registra una suborden por garantía');
      if (['repuestos_asignados', 'costo_mano_obra', 'total_estimado'].some((key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]))) throw new Error('La orden entregada no permite editar refacciones ni presupuesto. Registra un reingreso por garantía');
      if (previous.metodo_pago != null && (next.metodo_pago !== previous.metodo_pago || next.monto_cobrado !== previous.monto_cobrado)) throw new Error('El cobro entregado es definitivo');
    }
    if (next.estado !== previous.estado && !canTransitionOrder(previous.estado, next.estado)) throw new Error('Cambio de estado no permitido. La garantía requiere una suborden vinculada');
    if (next.estado === 'Entregado' && previous.estado !== 'Entregado') {
      if (previous.estado !== 'Listo') throw new Error('Marca la orden como Listo antes de entregar');
      if (!validPayment(next.metodo_pago, next.monto_cobrado)) throw new Error('Registra método e importe válido del cobro');
      if (tables.cortes_caja?.some((close) => close.fecha === day())) throw new Error('La caja de hoy ya está cerrada');
    }
  };
  const assignOrderPart = (order: any, sku: string, quantity: number, movementId: string) => {
    if (order.estado === 'Entregado') throw new Error('Orden entregada no editable. Registra un reingreso por garantía');
    const item = tables.inventario.find((row) => row.sku === sku);
    if (!item || !Number.isInteger(quantity) || quantity <= 0 || Number(item.stock_actual ?? 0) < quantity) throw new Error('Sin existencias: stock insuficiente o cantidad inválida');
    if (tables.cortes_caja?.some((close) => close.fecha === day())) throw new Error('La caja de hoy ya está cerrada');
    if (tables.movimientos_inventario.some((row) => row.id === movementId)) throw new Error('El movimiento ya existe');
    const now = new Date().toISOString();
    const part = { id: movementId, nombre: item.nombre, sku: item.sku, cantidad: quantity, precioUnitario: Number(item.precio_venta ?? 0), repuestoId: item.id, costoUnitario: Number(item.costo_compra ?? 0) };
    const movement = { id: movementId, repuesto_nombre: item.nombre, repuesto_id: item.id, codigo_orden: order.id, tipo: 'salida', cantidad: -quantity, autor: 'Taller', tiempo: 'Ahora', motivo: `Asignado a orden ${order.id} (${order.dispositivo_modelo ?? ''})`, costo_unitario: Number(item.costo_compra ?? 0), created_at: now };
    tables.consumos_repuestos ??= [];
    if (tables.consumos_repuestos.some((consumption) => consumption.orden_id === order.id && consumption.asignacion_id === movementId)) throw new Error('La asignación ya existe');
    item.stock_actual -= quantity;
    order.repuestos_asignados = [...(order.repuestos_asignados || []), part];
    order.total_estimado = Math.round((Number(order.total_estimado ?? order.costo_mano_obra ?? 0) + quantity * Number(item.precio_venta ?? 0)) * 100) / 100;
    tables.consumos_repuestos.push({ id: movementId, orden_id: order.id, sku: item.sku, cantidad: quantity, costo_unitario: Number(item.costo_compra ?? 0), asignacion_id: movementId, consumed_at: now });
    tables.movimientos_inventario.unshift(movement);
    return { item, movement };
  };
  const removeOrderPart = (order: any, partId: string, itemId: string, movementId: string) => {
    if (order.estado === 'Entregado') throw new Error('La orden entregada no permite retirar refacciones. Registra un reingreso por garantía');
    const parts = (order.repuestos_asignados ?? []).filter((part: any) => part.id === partId);
    if (parts.length !== 1) throw new Error('La refacción asignada cambió o ya fue retirada. Actualiza el expediente');
    const part = parts[0];
    if (!Number.isInteger(part.cantidad) || part.cantidad <= 0 || !Number.isFinite(part.precioUnitario) || part.precioUnitario < 0) throw new Error('La asignación histórica tiene cantidades o precio inválidos. Revisa el Kardex');
    const item = tables.inventario.find((row) => row.id === itemId);
    if (!item || (part.repuestoId != null ? part.repuestoId !== item.id : part.sku !== item.sku)) throw new Error('No se pudo vincular la refacción al inventario. Revisa su SKU antes de retirar');
    const available = tables.consumos_repuestos.filter((consumption) => consumption.orden_id === order.id && !tables.devoluciones_repuestos.some((returned) => returned.consumo_id === consumption.id));
    let consumption = available.filter((consumption) => consumption.asignacion_id === partId || consumption.id === partId);
    if (consumption.length === 0) consumption = available.filter((value) => value.asignacion_id == null && value.sku === part.sku && value.cantidad === part.cantidad);
    if (consumption.length !== 1) throw new Error('No se pudo identificar un consumo histórico único. Revisa el Kardex antes de retirar; no se inventará su costo');
    if (consumption[0].cantidad !== part.cantidad) throw new Error('La cantidad del consumo histórico no coincide. Revisa el Kardex');
    if (tables.cortes_caja.some((close) => close.fecha === day())) throw new Error('La caja de hoy ya está cerrada');
    if (!movementId || tables.movimientos_inventario.some((value) => value.id === movementId) || tables.devoluciones_repuestos.some((value) => value.orden_id === order.id && value.asignacion_id === partId)) throw new Error('La devolución ya existe');
    const now = new Date().toISOString();
    const returned = { id: movementId, consumo_id: consumption[0].id, orden_id: order.id, asignacion_id: partId, cantidad: part.cantidad, costo_unitario: consumption[0].costo_unitario, returned_at: now };
    const movement = { id: movementId, repuesto_nombre: item.nombre, repuesto_id: item.id, codigo_orden: order.id, tipo: 'entrada', cantidad: part.cantidad, autor: 'Taller', tiempo: 'Ahora', motivo: `Retirado de orden ${order.id}`, costo_unitario: consumption[0].costo_unitario, created_at: now };
    tables.devoluciones_repuestos.push(returned);
    tables.movimientos_inventario.unshift(movement);
    item.stock_actual = Number(item.stock_actual ?? 0) + part.cantidad;
    order.repuestos_asignados = order.repuestos_asignados.filter((value: any) => value.id !== partId);
    order.total_estimado = Math.round(Math.max(0, Number(order.total_estimado ?? order.costo_mano_obra ?? 0) - part.precioUnitario * part.cantidad) * 100) / 100;
    return { item, movement, returned };
  };
  const makeCounterSale = (request: any) => {
    if (!request || typeof request.id !== 'string' || !request.id.trim() || request.id.length > 100) throw new Error('Venta inválida');
    if (tables.ventas_mostrador.some((sale) => sale.id === request.id)) throw new Error('El folio de venta ya existe. No se volverá a cobrar');
    if (!validPayment(request.metodoPago, 0)) throw new Error('Selecciona un método de pago válido');
    const item = tables.inventario.find((row) => row.id === request.itemId);
    if (!item || item.sku !== request.sku) throw new Error('El producto cambió. Revisa el inventario');
    if (!Number.isInteger(request.cantidad) || request.cantidad <= 0 || Number(item.stock_actual ?? 0) < request.cantidad) throw new Error('Sin existencias: stock insuficiente o cantidad inválida');
    if (!Number.isFinite(Number(item.precio_venta)) || Number(item.precio_venta) < 0 || !Number.isFinite(Number(item.costo_compra ?? 0)) || Number(item.costo_compra ?? 0) < 0) throw new Error('El producto tiene precios o costos inválidos');
    if (typeof request.precioUnitario !== 'number' || !Number.isFinite(request.precioUnitario) || request.precioUnitario < 0 || Math.round(request.precioUnitario * 100) !== Math.round(Number(item.precio_venta) * 100)) throw new Error('Conflicto: el precio de venta cambió. Revisa el importe y confirma nuevamente antes de cobrar');
    if (tables.cortes_caja.some((close) => close.fecha === day())) throw new Error('La caja de hoy ya está cerrada');
    if (tables.movimientos_inventario.some((movement) => movement.id === request.id)) throw new Error('El movimiento de venta ya existe');
    const sale = { id: request.id, item_id: item.id, sku: item.sku, nombre: item.nombre, cantidad: request.cantidad, precio_unitario: Number(item.precio_venta), costo_unitario: Number(item.costo_compra ?? 0), metodo_pago: request.metodoPago, total: Math.round(request.cantidad * Number(item.precio_venta) * 100) / 100, created_at: new Date().toISOString() };
    const movement = { id: sale.id, repuesto_nombre: item.nombre, repuesto_id: item.id, tipo: 'salida', cantidad: -sale.cantidad, autor: 'Mostrador', tiempo: 'Ahora', motivo: 'Venta de mostrador', costo_unitario: sale.costo_unitario, created_at: sale.created_at };
    item.stock_actual -= sale.cantidad;
    tables.ventas_mostrador.push(sale);
    tables.movimientos_inventario.unshift(movement);
    return { item, movement, sale };
  };
  const notify = (change: Change) => {
    for (const channel of channels) {
      if (!channel.subscribed) continue;
      for (const { type, filter, callback } of channel.listeners) {
        const rowFilter = filter.filter ? /^([^=]+)=eq\.([\s\S]*)$/.exec(filter.filter) : null;
        const row = change.eventType === 'DELETE' ? change.old : change.new;
        if (type === 'postgres_changes' && (!filter.event || filter.event === '*' || filter.event === change.eventType)
          && (!filter.schema || filter.schema === change.schema)
          && (!filter.table || filter.table === change.table)
          && (!filter.filter || (rowFilter && String(row[rowFilter[1]]) === rowFilter[2]))) {
          queueMicrotask(() => { if (channel.subscribed) callback(clone(change)); });
        }
      }
    }
    if (change.table === 'ordenes') {
      const orderId = change.new.id ?? change.old.id;
      if (!orderId) return;
      for (const channel of channels) {
        if (!channel.subscribed || channel.name !== `tracking:${orderId}`) continue;
        for (const listener of channel.listeners) {
          if (listener.type === 'broadcast' && (!listener.filter.event || listener.filter.event === '*' || listener.filter.event === 'order_changed')) {
            queueMicrotask(() => {
              if (channel.subscribed) listener.callback({ type: 'broadcast', event: 'order_changed', payload: { orderId } });
            });
          }
        }
      }
    }
  };
  const restoreTables = () => {
    try {
      if (!persistenceEnabled || typeof localStorage === 'undefined') return;
      const saved = JSON.parse(localStorage.getItem(persistenceKey) || 'null');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        for (const [name, rows] of Object.entries(saved)) {
          if (Array.isArray(rows)) tables[name] = rows;
        }
      }
    } catch (error) {
      console.warn('[CelMart] No se pudieron recuperar los datos de demostración', error);
    }
  };
  const persistTables = () => {
    try {
      if (persistenceEnabled && typeof localStorage !== 'undefined') localStorage.setItem(persistenceKey, JSON.stringify(tables));
    } catch (error) {
      // Preserve the newer in-memory state if the browser storage quota is full.
      persistenceEnabled = false;
      console.warn('[CelMart] No hay espacio para conservar los datos locales al recargar', error);
    }
  };
  restoreTables();
  // Other tabs share demo data; the real client uses Supabase Realtime instead.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key !== persistenceKey) return;
      const previous = clone(tables);
      restoreTables();
      for (const table of ['ordenes', 'inventario', 'tecnicos', 'movimientos_inventario', 'configuracion_taller', 'cortes_caja', 'ventas_mostrador', 'devoluciones_repuestos']) {
        const oldRows = new Map((previous[table] ?? []).map((row: any) => [row.id, row]));
        const newRows = new Map((tables[table] ?? []).map((row: any) => [row.id, row]));
        for (const [id, row] of newRows) {
          const old = oldRows.get(id);
          if (JSON.stringify(row) !== JSON.stringify(old)) {
            notify({ eventType: old ? 'UPDATE' : 'INSERT', schema: 'public', table, new: row, old: old ?? {} });
          }
        }
        for (const [id, row] of oldRows) {
          if (!newRows.has(id)) notify({ eventType: 'DELETE', schema: 'public', table, new: {}, old: row });
        }
      }
    });
  }

  const createQueryBuilder = (tableName: string) => {
    if (!tables[tableName]) {
      tables[tableName] = [];
    }

    let operation: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
    let pendingInsertRows: any[] = [];
    let pendingUpdateFields: any = null;
    const filters: { column: string; value: any }[] = [];
    let orderClause: { column: string; ascending: boolean } | null = null;
    let rangeClause: { from: number; to: number } | null = null;
    let cardinality: 'many' | 'single' | 'maybeSingle' = 'many';
    let selectedColumns = '*';
    let execution: Promise<any> | undefined;
    let upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    const stampRow = (row: any, previous?: any) => {
      if (tableName === 'configuracion_taller') return { ...row, id: row.id ?? 'default', updated_at: new Date().toISOString() };
      if (tableName === 'ordenes') {
        return {
          ...row,
          estado_actualizado_at: !previous || row.estado!==previous.estado ? new Date().toISOString() : previous.estado_actualizado_at ?? null,
          entregado_at: previous?.entregado_at ?? (
            row.estado === 'Entregado' && (!previous || previous.estado !== 'Entregado') ? new Date().toISOString() : null
          ),
        };
      }
      return row;
    };
    const configError = (rows: any[]) => tableName === 'configuracion_taller' && rows.some((row) =>
      row.id !== 'default' || !row.config_json || typeof row.config_json !== 'object' || Array.isArray(row.config_json))
      ? { code: '23514', message: 'La configuración debe ser un objeto y usar id default.' } : null;
    const matches = (row: any) => filters.every(({ column, value }) => {
      let expected = value;
      // PostgREST serializes JSONB and PostgreSQL text[] optimistic-lock filters.
      if (typeof expected === 'string') {
        try {
          if (['checklist_json', 'notas_tecnicas', 'repuestos_asignados'].includes(column)) {
            expected = JSON.parse(expected);
          } else if (column === 'fotos_evidencia' && expected.startsWith('{') && expected.endsWith('}')) {
            expected = JSON.parse(`[${expected.slice(1, -1)}]`);
          }
        } catch { /* A literal string simply will not match a JSON/array column. */ }
      }
      return JSON.stringify(row[column] ?? null) === JSON.stringify(expected ?? null);
    });
    const result = (rows: any[]) => {
      const columns = selectedColumns === '*' ? null : selectedColumns.split(',').map((column) => column.trim());
      const projected = clone(rows.map((row) => columns
        ? Object.fromEntries(columns.map((column) => [column, row[column]]))
        : row));
      if (cardinality === 'many') return { data: projected, error: null };
      if (projected.length === 1 || (projected.length === 0 && cardinality === 'maybeSingle')) {
        return { data: projected[0] ?? null, error: null };
      }
      return { data: null, error: { code: 'PGRST116', message: 'La consulta no devolvió exactamente una fila' } };
    };

    const executeQuery = async () => {
      restoreTables();
      const store = tables[tableName];

      if (operation === 'insert') {
        const inserted = pendingInsertRows.map((row) => stampRow({
          ...row,
          id: tableName === 'configuracion_taller' ? row.id ?? 'default'
            : row.id || `${tableName.slice(0, 3)}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          created_at: row.created_at || new Date().toISOString(),
        }));
        const validationError = configError(inserted);
        if (validationError) return { data: null, error: validationError };
        if (tableName === 'ordenes') {
          try { inserted.forEach((row) => assertOrderUpdate(undefined, row)); }
          catch (error) { return { data: null, error: { message: (error as Error).message } }; }
        }
        const ids = new Set(store.map((row) => row.id));
        for (const row of inserted) {
          if (ids.has(row.id)) {
            return {
              data: null,
              error: { code: '23505', message: `duplicate key value violates unique constraint "${tableName}_pkey"` },
            };
          }
          ids.add(row.id);
        }
        store.unshift(...inserted);
        persistTables();
        inserted.forEach((row) => notify({ eventType: 'INSERT', schema: 'public', table: tableName, new: row, old: {} }));
        return result(inserted);
      }

      if (operation === 'upsert') {
        const plannedStore = clone(store);
        const changed: any[] = [];
        const changes: Change[] = [];
        const columns = (upsertOptions.onConflict ?? 'id').split(',').map((column) => column.trim());
        for (const raw of pendingInsertRows) {
          const incoming = tableName === 'configuracion_taller' ? { ...raw, id: raw.id ?? 'default' } : raw;
          const index = plannedStore.findIndex((row) => columns.every((column) => row[column] === incoming[column]));
          if (index >= 0 && upsertOptions.ignoreDuplicates) continue;
          const previous = index >= 0 ? plannedStore[index] : undefined;
          const row = stampRow({
            ...previous, ...clone(incoming),
            id: incoming.id ?? previous?.id ?? `${tableName.slice(0, 3)}-${crypto.randomUUID()}`,
            created_at: previous?.created_at ?? incoming.created_at ?? new Date().toISOString(),
          }, previous);
          const validationError = configError([row]);
          if (validationError) return { data: null, error: validationError };
          if (tableName === 'ordenes') {
            try { assertOrderUpdate(previous, row); }
            catch (error) { return { data: null, error: { message: (error as Error).message } }; }
          }
          if (index >= 0) plannedStore[index] = row;
          else plannedStore.unshift(row);
          changed.push(row);
          changes.push({ eventType: previous ? 'UPDATE' : 'INSERT', schema: 'public', table: tableName, new: row, old: previous ?? {} });
        }
        tables[tableName] = plannedStore;
        persistTables();
        changes.forEach(notify);
        return result(changed);
      }

      if (operation === 'update') {
        const updated: any[] = [];
        const changes: Change[] = [];
        for (let i = 0; i < store.length; i++) {
          if (matches(store[i])) {
            const previous = store[i];
            const next = stampRow({ ...store[i], ...clone(pendingUpdateFields) }, previous);
            const validationError = configError([next]);
            if (validationError) return { data: null, error: validationError };
            if (tableName === 'ordenes') {
              try { assertOrderUpdate(previous, next); }
              catch (error) { return { data: null, error: { message: (error as Error).message } }; }
            }
            updated.push(next);
            changes.push({ eventType: 'UPDATE', schema: 'public', table: tableName, new: next, old: previous });
          }
        }
        for (const change of changes) store[store.findIndex((row) => row.id === change.old.id)] = change.new;
        persistTables();
        changes.forEach(notify);
        return result(updated);
      }

      if (operation === 'delete') {
        const deleted = store.filter(matches);
        tables[tableName] = store.filter((item) => !matches(item));
        persistTables();
        deleted.forEach((row) => notify({ eventType: 'DELETE', schema: 'public', table: tableName, new: {}, old: row }));
        return result(deleted);
      }

      // Default: select
      const results = store.filter(matches);
      if (orderClause) {
        const { column, ascending } = orderClause;
        results.sort((a, b) => {
          if (a[column] < b[column]) return ascending ? -1 : 1;
          if (a[column] > b[column]) return ascending ? 1 : -1;
          return 0;
        });
      }
      return result(rangeClause ? results.slice(rangeClause.from, rangeClause.to + 1) : results);
    };

    const execute = () => {
      // Web Locks serialize demo read/modify/write operations across browser tabs.
      // The production client delegates concurrency to PostgreSQL instead.
      if (typeof navigator !== 'undefined' && navigator.locks) {
        return navigator.locks.request(persistenceKey, executeQuery);
      }
      return executeQuery();
    };

    const builder: any = {
      select(_columns = '*') {
        selectedColumns = _columns;
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        orderClause = { column, ascending: options?.ascending !== false };
        return builder;
      },
      range(from: number, to: number) {
        rangeClause = { from, to };
        return builder;
      },
      eq(column: string, value: any) {
        filters.push({ column, value });
        return builder;
      },
      is(column: string, value: null | boolean) {
        filters.push({ column, value });
        return builder;
      },
      single() {
        cardinality = 'single';
        return builder;
      },
      maybeSingle() {
        cardinality = 'maybeSingle';
        return builder;
      },
      insert(rows: any[]) {
        operation = 'insert';
        pendingInsertRows = Array.isArray(rows) ? rows : [rows];
        return builder;
      },
      upsert(rows: any | any[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
        operation = 'upsert';
        pendingInsertRows = Array.isArray(rows) ? rows : [rows];
        upsertOptions = options ?? {};
        return builder;
      },
      update(fields: any) {
        operation = 'update';
        pendingUpdateFields = fields;
        return builder;
      },
      delete() {
        operation = 'delete';
        return builder;
      },
      then(onfulfilled?: (val: any) => any, onrejected?: (reason: any) => any) {
        execution ??= execute();
        return execution.then(onfulfilled, onrejected);
      },
      catch(onrejected?: (reason: any) => any) {
        execution ??= execute();
        return execution.catch(onrejected);
      },
    };

    return builder;
  };

  const media = new Map<string, string>();
  return {
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string, body: Blob, options?: { upsert?: boolean }) {
            const key = `${bucket}/${path}`;
            if (media.has(key) && !options?.upsert) {
              return { data: null, error: { message: 'El archivo ya existe' } };
            }
            try {
              const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(body);
              });
              media.set(key, dataUrl);
              return { data: { path, fullPath: key }, error: null };
            } catch (error) {
              return { data: null, error };
            }
          },
          getPublicUrl(path: string) {
            return { data: { publicUrl: media.get(`${bucket}/${path}`) ?? '' } };
          },
          async remove(paths: string[]) {
            paths.forEach((path) => media.delete(`${bucket}/${path}`));
            return { data: paths.map((name) => ({ name })), error: null };
          },
        };
      },
    },
    channel(name: string, _options?: unknown) {
      const channel = {
        name,
        listeners: [] as Listener[],
        subscribed: false,
        on(type: string, filter: Listener['filter'], callback: Listener['callback']) {
          channel.listeners.push({ type, filter, callback });
          return channel;
        },
        subscribe(callback?: (status: string) => void) {
          channel.subscribed = true;
          channels.add(channel);
          if (callback) queueMicrotask(() => callback('SUBSCRIBED'));
          return channel;
        },
        async unsubscribe() {
          channel.subscribed = false;
          channels.delete(channel);
          return 'ok';
        },
      };
      return channel;
    },
    async removeChannel(channel: { unsubscribe: () => Promise<string> }) {
      return channel.unsubscribe();
    },
    auth: {
      signInWithPassword: async ({ email, password }: { email: string; password?: string }) => {
        if(!email.trim()||!password?.trim())return {data:{session:null},error:{message:'Introduce correo y contraseña.'}};
        const session={access_token:'mock-token',user:{id:'mock-user-1',email:email.trim()}};
        try {
          localStorage.setItem('celmart_mock_session',JSON.stringify(session));
          localStorage.setItem('celmart_mock_login_explicit','1');
        } catch { return {data:{session:null},error:{message:'El navegador no pudo guardar la sesión explícita.'}}; }
        return {data:{session},error:null};
      },
      onAuthStateChange: (callback:(event:string)=>void) => {authListeners.add(callback);return {data:{subscription:{unsubscribe:()=>{authListeners.delete(callback);}}}};},
      signOut: async (_options?:{scope?:'local'|'global'|'others'}) => {
        for(const key of ['celmart_mock_login_explicit','celmart_mock_session']) {try{localStorage.removeItem(key);}catch{/* App also locks locally. */}}
        for(const callback of authListeners)callback('SIGNED_OUT');
        return {error:null};
      },
      getSession: async () => {
        let session:{access_token:string;user:{id:string;email:string}}|null=null;
        try {
          if(localStorage.getItem('celmart_mock_login_explicit')==='1') {
            const saved=JSON.parse(localStorage.getItem('celmart_mock_session')||'null');
            if(saved?.access_token==='mock-token'&&saved?.user?.id==='mock-user-1'&&typeof saved?.user?.email==='string'&&saved.user.email.trim())session=saved;
          }
        } catch { /* Missing, old or malformed storage never creates a session. */ }
        return {data:{session},error:null};
      },
    },
    from(tableName: string) {
      return createQueryBuilder(tableName);
    },
    async rpc(name: string, args: Record<string, any> = {}, lockHeld = false): Promise<{data:any;error:any}> {
      if (!lockHeld && typeof navigator !== 'undefined' && navigator.locks) {
        return navigator.locks.request(persistenceKey, () => this.rpc(name, args, true));
      }
      if (name==='apply_offline_operation') {
        restoreTables();
        tables.celmart_sync_operations??=[];
        const id=args.p_operation_id, command=args.p_command, kind=command?.kind;
        try {
          if(args.p_owner_id!=='mock-user-1')throw new Error('Inicia sesión con la cuenta que guardó estos cambios.');
          const prior=tables.celmart_sync_operations.find(row=>row.id===id);
          if(prior){if(JSON.stringify(prior.command)!==JSON.stringify(command))throw new Error('El contenido de una operación confirmada no puede cambiar.');return {data:{...clone(prior.result),replayed:true},error:null};}
          let order=tables.ordenes.find(row=>row.id===command.orderId);
          let item=tables.inventario.find(row=>row.id===(command.itemId||command.row?.id));
          let client:any=null,movement:any=null,sale:any=null,returned:any=null;
          if(['status','note','location','photo','payment','delivery','assignPart','removePart'].includes(kind)&&!order)throw new Error('La orden ya no existe en el servidor.');
          const old=clone(order||{});
          if(kind==='createOrder') {
            if(tables.ordenes.some(row=>row.id===command.row.id))throw new Error('El folio ya existe.');
            order={...clone(command.row),estado:'Recibido',created_at:command.row.created_at||new Date().toISOString(),estado_actualizado_at:new Date().toISOString(),fotos_evidencia:command.photos,repuestos_asignados:[],entregado_at:null};tables.ordenes.unshift(order);
          } else if(kind==='status') {
            if(!['Recibido','En Diagnóstico','Esperando Presupuesto','Esperando Repuesto','En Reparación','Listo','Entregado','Garantía'].includes(command.to))throw new Error('Estado inválido');
            if(order.estado!==command.to) {
              if(order.estado!==command.from)throw new Error('Conflicto: otra persona cambió el estado.');
              assertOrderUpdate(order,{...order,estado:command.to});
              order.estado=command.to;order.estado_actualizado_at=new Date().toISOString();if(command.to==='Entregado')order.entregado_at??=new Date().toISOString();
            }
          } else if(kind==='note')order.notas_tecnicas=[clone(command.note),...(order.notas_tecnicas||[]).filter((note:any)=>note.id!==command.note.id)];
          else if(kind==='location')order.ubicacion_fisica=command.value;
          else if(kind==='photo')order.fotos_evidencia=[...new Set([...(order.fotos_evidencia||[]),command.url])];
          else if(kind==='payment') {
            if(!validPayment(command.method,command.amount))throw new Error('Cobro inválido');
            assertOrderUpdate(order,{...order,metodo_pago:command.method,monto_cobrado:command.amount});
            order.metodo_pago=command.method;order.monto_cobrado=Math.round(command.amount*100)/100;
          }
          else if(kind==='delivery') {
            if(order.estado!==command.from)throw new Error('Conflicto: otra persona cambió el estado. Revisa la orden antes de entregar.');
            if(!validPayment(command.method,command.amount))throw new Error('Cobro inválido');
            assertOrderUpdate(order,{...order,estado:'Entregado',metodo_pago:command.method,monto_cobrado:command.amount});
            order.estado='Entregado';order.metodo_pago=command.method;order.monto_cobrado=Math.round(command.amount*100)/100;
            order.entregado_at=new Date().toISOString();order.estado_actualizado_at=order.entregado_at;
          }
          else if(kind==='assignPart') {
            if(!item||item.sku!==command.part.sku)throw new Error('El repuesto cambió. Revisa el inventario.');
            const assigned=assignOrderPart(order,item.sku,command.part.cantidad,command.part.id||id);
            item=assigned.item;movement=assigned.movement;
          } else if(kind==='removePart') {
            const removed=removeOrderPart(order,command.partId,command.itemId,command.movementId);
            item=removed.item;movement=removed.movement;returned=removed.returned;
          } else if(kind==='sale') {
            const sold=makeCounterSale(command.sale);
            item=sold.item;movement=sold.movement;sale=sold.sale;
          } else if(kind==='stock') {
            if(!item||!Number.isInteger(command.delta)||item.stock_actual+command.delta<0)throw new Error('Stock insuficiente para aplicar el ajuste pendiente.');
            item.stock_actual+=command.delta;movement={id,repuesto_nombre:item.nombre,tipo:command.delta>0?'reabastecimiento':'consumo',cantidad:command.delta,autor:'Taller',tiempo:'Ahora',created_at:new Date().toISOString()};tables.movimientos_inventario.unshift(movement);
          } else if(kind==='createInventory') {
            if(tables.inventario.some(row=>row.sku===command.row.sku))throw new Error('Ya existe un repuesto con este SKU.');
            item={...clone(command.row),created_at:new Date().toISOString()};tables.inventario.unshift(item);
          } else if(kind==='editInventory') {
            if(!item)throw new Error('El repuesto ya no existe.');
            if(item.stock_actual!==command.previousStock)throw new Error('Conflicto: el stock cambió en otro dispositivo.');
            Object.assign(item,clone(command.row));
          } else if(kind==='createClient') {client={...clone(command.row),reparaciones_realizadas:0,saldo_pendiente:0,ultima_visita:'Hoy'};tables.clientes.unshift(client);}
          else throw new Error('Tipo de operación no permitido.');
          const result:any={};
          if(order)result.orders=[clone(order)];if(item)result.inventory=[clone(item)];if(client)result.clients=[clone(client)];if(movement)result.movements=[clone(movement)];
          if(sale)result.sales=[clone(sale)];
          tables.celmart_sync_operations.push({id,command:clone(command),result:clone(result)});persistTables();
          if(order)notify({eventType:kind==='createOrder'?'INSERT':'UPDATE',schema:'public',table:'ordenes',new:clone(order),old});
          if(item)notify({eventType:kind==='createInventory'?'INSERT':'UPDATE',schema:'public',table:'inventario',new:clone(item),old:{}});
          if(movement)notify({eventType:'INSERT',schema:'public',table:'movimientos_inventario',new:clone(movement),old:{}});
          if(sale)notify({eventType:'INSERT',schema:'public',table:'ventas_mostrador',new:clone(sale),old:{}});
          if(returned)notify({eventType:'INSERT',schema:'public',table:'devoluciones_repuestos',new:clone(returned),old:{}});
          return {data:result,error:null};
        } catch(error){return {data:null,error:{message:(error as Error).message}};}
      }
      if (['resumen_caja','cerrar_caja','reingreso_garantia','asignar_repuesto'].includes(name)) {
        restoreTables();
        tables.cortes_caja??=[]; tables.consumos_repuestos??=[];
        try {
          if(name==='resumen_caja'||name==='cerrar_caja') {
            const date=name==='cerrar_caja'?day():args.p_fecha;
            const orders=tables.ordenes.filter(o=>o.estado==='Entregado'&&o.entregado_at&&day(new Date(o.entregado_at))===date);
            const sales=tables.ventas_mostrador.filter((sale)=>day(new Date(sale.created_at))===date);
            const sum=(method:string)=>orders.filter(o=>o.metodo_pago===method).reduce((n,o)=>n+Number(o.monto_cobrado||0),0)+sales.filter((sale)=>sale.metodo_pago===method).reduce((n,sale)=>n+Number(sale.total),0);
            const costs=tables.consumos_repuestos.filter(o=>day(new Date(o.consumed_at))===date).reduce((n,o)=>n+o.cantidad*o.costo_unitario,0)
              +sales.reduce((n,sale)=>n+sale.cantidad*sale.costo_unitario,0)
              -tables.devoluciones_repuestos.filter((value)=>day(new Date(value.returned_at))===date).reduce((n,value)=>n+value.cantidad*value.costo_unitario,0);
            const data={fecha:date,total_efectivo:sum('Efectivo'),total_transferencia:sum('Transferencia'),total_tarjeta:sum('Tarjeta'),sin_metodo:orders.filter(o=>!o.metodo_pago||o.monto_cobrado==null).length,gastos_repuestos:costs};
            if(name==='resumen_caja')return {data,error:null};
            if(!Number.isFinite(args.p_apertura)||args.p_apertura<0)throw new Error('Apertura inválida');
            if(data.sin_metodo)throw new Error('Hay entregas sin método de pago');
            if(tables.cortes_caja.some(c=>c.fecha===date))throw new Error('La caja ya está cerrada');
            const closed={...data,id:'CAJA-'+date,monto_apertura:args.p_apertura,total_neto:Math.round((args.p_apertura+data.total_efectivo+data.total_transferencia+data.total_tarjeta-data.gastos_repuestos)*100)/100,cerrado_por:'Demo',observaciones:args.p_observaciones||'',created_at:new Date().toISOString()};tables.cortes_caja.push(closed);persistTables();notify({eventType:'INSERT',schema:'public',table:'cortes_caja',new:closed,old:{}});return {data:clone(closed),error:null};
          }
          const o=tables.ordenes.find(o=>o.id===args.p_order_id);if(!o)throw new Error('Orden no encontrada');
          if(name==='reingreso_garantia') {
            const elapsed=Date.now()-Date.parse(o.entregado_at);if(o.estado!=='Entregado'||!Number.isFinite(elapsed)||elapsed<0||elapsed>=o.garantia_dias*86400000||o.parent_order_id)throw new Error('Garantía no vigente');
            if(String(args.p_motivo||'').trim().length<3)throw new Error('Indica motivo');
            const n=Math.max(0,...tables.ordenes.filter(c=>c.parent_order_id===o.id).map(c=>Number(c.id.split('-G').pop())))+1;
            const child={...clone(o),id:o.id+'-G'+n,parent_order_id:o.id,motivo_garantia:args.p_motivo,estado:'Garantía',estado_actualizado_at:new Date().toISOString(),ubicacion_fisica:null,entregado_at:null,metodo_pago:null,monto_cobrado:null,costo_mano_obra:0,total_estimado:0,repuestos_asignados:[],fotos_evidencia:[],checklist_json:{},falla_declarada:args.p_motivo,created_at:new Date().toISOString(),notas_tecnicas:[{id:crypto.randomUUID(),autor:'Recepción',contenido:'Reingreso asignado a '+(o.tecnico_nombre||'Por asignar')+': '+args.p_motivo,fecha:new Date().toISOString(),tipo:'general'}]};tables.ordenes.unshift(child);persistTables();notify({eventType:'INSERT',schema:'public',table:'ordenes',new:child,old:{}});return {data:clone(child),error:null};
          }
          const assigned=assignOrderPart(o,args.p_sku,args.p_cantidad,crypto.randomUUID());
          persistTables();
          notify({eventType:'UPDATE',schema:'public',table:'ordenes',new:o,old:{}});
          notify({eventType:'UPDATE',schema:'public',table:'inventario',new:assigned.item,old:{}});
          notify({eventType:'INSERT',schema:'public',table:'movimientos_inventario',new:assigned.movement,old:{}});
          return {data:clone(o),error:null};
        }catch(e){return {data:null,error:{message:(e as Error).message}};}
      }
      if (name !== 'get_order_tracking') return { data: null, error: { code: 'PGRST202', message: 'Función no encontrada.' } };
      const id = args?.p_order_id;
      if (typeof id !== 'string' || id.length > 64 || !/^OS-[0-9]+(-[A-F0-9]{8})?(-G[0-9]+)?$/.test(id) || /\s/.test(id)) return { data: null, error: null };
      restoreTables();
      const order = tables.ordenes.find((row) => row.id === id);
      if (!order) return { data: null, error: null };
      const config = tables.configuracion_taller.find((row) => row.id === 'default')?.config_json ?? {};
      const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
      const finite = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
      const digits = text(order.cliente_telefono).replace(/\D/g, '');
      const categories = ['Smartphone', 'Consola', 'Control / Mando', 'PC / Laptop', 'Tablet', 'Microsoldadura / Placa'];
      return { data: clone({
        id: order.id,
        estado: text(order.estado, 'Recibido'),
        dispositivo: {
          marca: text(order.dispositivo_marca), modelo: text(order.dispositivo_modelo),
          categoria: categories.includes(order.categoria_dispositivo) ? order.categoria_dispositivo : 'Smartphone',
        },
        fallaDeclarada: text(order.falla_declarada),
        fotosEvidencia: Array.isArray(order.fotos_evidencia) ? order.fotos_evidencia.filter((url: unknown) => typeof url === 'string') : [],
        costoManoObra: finite(Number(order.costo_mano_obra)), totalEstimado: finite(Number(order.total_estimado)),
        garantiaDias: order.garantia_dias == null ? 30 : finite(Number(order.garantia_dias), 30),
        fechaEntrega: typeof order.entregado_at === 'string' ? order.entregado_at : null,
        clienteTelefonoMascara: digits.length >= 4 ? `***-***-${digits.slice(-4)}` : 'Sin teléfono',
        repuestos: Array.isArray(order.repuestos_asignados) ? order.repuestos_asignados
          .filter((part: unknown) => part && typeof part === 'object' && !Array.isArray(part))
          .map((part: any) => ({ nombre: text(part.nombre, 'Repuesto'), cantidad: finite(part.cantidad), precioUnitario: finite(part.precioUnitario) })) : [],
        taller: {
          nombre: text(config.nombreTaller, 'CelMart'), telefono: text(config.telefono),
          politicaGarantiaTexto: text(config.politicaGarantiaTexto), simboloMoneda: text(config.simboloMoneda, '$'),
        },
      }), error: null };
    },
  };
}

let clientInstance: any = null;
let mockMode = false;

if (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http')) {
  try {
    clientInstance = createClient(supabaseUrl, supabaseAnonKey);
  } catch (err) {
    console.warn('[AI Studio] Could not initialize Supabase client:', err);
    clientInstance = createMockSupabaseClient();
    mockMode = true;
  }
} else {
  clientInstance = createMockSupabaseClient();
  mockMode = true;
}

export const supabase = clientInstance;
export const isSupabaseMock = mockMode;
