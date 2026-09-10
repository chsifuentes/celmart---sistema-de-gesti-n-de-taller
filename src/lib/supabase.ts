import { createClient } from '@supabase/supabase-js';
import { initialClients, initialInventoryItems, initialOrders } from '../data/initialData';

const supabaseUrl = ((import.meta as any).env?.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = ((import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '').trim();

function createMockSupabaseClient() {
  console.info('[AI Studio] Supabase credentials not provided or offline — using in-memory mock store');

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
      estado: o.estado,
      tecnico_nombre: o.tecnico?.nombre,
      tecnico_iniciales: o.tecnico?.iniciales,
      ingreso: o.ingreso,
      falla_declarada: o.fallaDeclarada,
      pre_diagnostico: o.preDiagnostico,
      observaciones_fisicas: o.observacionesFisicas,
      equipo_apagado: o.checklist.equipoApagado,
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
    })),
  };

  const createQueryBuilder = (tableName: string) => {
    if (!tables[tableName]) {
      tables[tableName] = [];
    }

    let operation: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let pendingInsertRows: any[] = [];
    let pendingUpdateFields: any = null;
    let filterEq: { column: string; value: any } | null = null;
    let orderClause: { column: string; ascending: boolean } | null = null;

    const execute = async () => {
      const store = tables[tableName];

      if (operation === 'insert') {
        const inserted = pendingInsertRows.map((row) => ({
          ...row,
          id: row.id || `${tableName.slice(0, 3)}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          created_at: row.created_at || new Date().toISOString(),
        }));
        store.unshift(...inserted);
        return { data: inserted, error: null };
      }

      if (operation === 'update') {
        let updatedCount = 0;
        for (let i = 0; i < store.length; i++) {
          if (!filterEq || store[i][filterEq.column] === filterEq.value) {
            store[i] = { ...store[i], ...pendingUpdateFields };
            updatedCount++;
          }
        }
        return { data: updatedCount, error: null };
      }

      if (operation === 'delete') {
        if (filterEq) {
          tables[tableName] = store.filter((item) => item[filterEq.column] !== filterEq.value);
        }
        return { data: null, error: null };
      }

      // Default: select
      let results = [...store];
      if (filterEq) {
        results = results.filter((item) => item[filterEq.column] === filterEq.value);
      }
      if (orderClause) {
        const { column, ascending } = orderClause;
        results.sort((a, b) => {
          if (a[column] < b[column]) return ascending ? -1 : 1;
          if (a[column] > b[column]) return ascending ? 1 : -1;
          return 0;
        });
      }
      return { data: results, error: null };
    };

    const builder: any = {
      select(_columns = '*') {
        operation = 'select';
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        orderClause = { column, ascending: options?.ascending !== false };
        return builder;
      },
      eq(column: string, value: any) {
        filterEq = { column, value };
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
        return execute().then(onfulfilled, onrejected);
      },
      catch(onrejected?: (reason: any) => any) {
        return execute().catch(onrejected);
      },
    };

    return builder;
  };

  return {
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

if (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http')) {
  try {
    clientInstance = createClient(supabaseUrl, supabaseAnonKey);
  } catch (err) {
    console.warn('[AI Studio] Could not initialize Supabase client:', err);
    clientInstance = createMockSupabaseClient();
  }
} else {
  clientInstance = createMockSupabaseClient();
}

export const supabase = clientInstance;
