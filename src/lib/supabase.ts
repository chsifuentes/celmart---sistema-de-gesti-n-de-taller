import { createClient } from '@supabase/supabase-js';
import { initialClients, initialInventoryItems, initialOrders } from '../data/initialData';

const supabaseUrl = ((import.meta as any).env?.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = ((import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '').trim();

export function createMockSupabaseClient() {
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
  };

  type Change = { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; schema: string; table: string; new: any; old: any };
  type Listener = { filter: { event?: string; schema?: string; table?: string }; callback: (change: Change) => void };
  const channels = new Set<{ listeners: Listener[]; subscribed: boolean }>();
  let persistenceEnabled = true;
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
  const notify = (change: Change) => {
    for (const channel of channels) {
      if (!channel.subscribed) continue;
      for (const { filter, callback } of channel.listeners) {
        if ((!filter.event || filter.event === '*' || filter.event === change.eventType)
          && (!filter.schema || filter.schema === change.schema)
          && (!filter.table || filter.table === change.table)) {
          queueMicrotask(() => callback(clone(change)));
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
      restoreTables();
      for (const table of ['ordenes', 'inventario']) {
        notify({ eventType: 'UPDATE', schema: 'public', table, new: {}, old: {} });
      }
    });
  }

  const createQueryBuilder = (tableName: string) => {
    if (!tables[tableName]) {
      tables[tableName] = [];
    }

    let operation: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let pendingInsertRows: any[] = [];
    let pendingUpdateFields: any = null;
    const filters: { column: string; value: any }[] = [];
    let orderClause: { column: string; ascending: boolean } | null = null;
    let rangeClause: { from: number; to: number } | null = null;
    let cardinality: 'many' | 'single' | 'maybeSingle' = 'many';
    let selectedColumns = '*';
    let execution: Promise<any> | undefined;
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
        const inserted = pendingInsertRows.map((row) => ({
          ...row,
          id: row.id || `${tableName.slice(0, 3)}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          created_at: row.created_at || new Date().toISOString(),
        }));
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

      if (operation === 'update') {
        const updated: any[] = [];
        for (let i = 0; i < store.length; i++) {
          if (matches(store[i])) {
            const previous = store[i];
            store[i] = { ...store[i], ...clone(pendingUpdateFields) };
            updated.push(store[i]);
            notify({ eventType: 'UPDATE', schema: 'public', table: tableName, new: store[i], old: previous });
          }
        }
        persistTables();
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
    channel(_name: string) {
      const channel = {
        listeners: [] as Listener[],
        subscribed: false,
        on(_event: string, filter: Listener['filter'], callback: Listener['callback']) {
          channel.listeners.push({ filter, callback });
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
        // Accept any demo login or credentials
        return {
          data: {
            session: {
              access_token: 'mock-token',
              user: { id: 'mock-user-1', email: email || 'admin@celmart.mx' },
            },
          },
          error: null,
        };
      },
      signOut: async () => ({ error: null }),
      getSession: async () => ({
        data: {
          session: {
            access_token: 'mock-token',
            user: { id: 'mock-user-1', email: 'admin@celmart.mx' },
          },
        },
        error: null,
      }),
    },
    from(tableName: string) {
      return createQueryBuilder(tableName);
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
