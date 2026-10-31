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
  };

  type Change = { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; schema: string; table: string; new: any; old: any };
  type Listener = { type: string; filter: { event?: string; schema?: string; table?: string; filter?: string }; callback: (payload: any) => void };
  const channels = new Set<{ name: string; listeners: Listener[]; subscribed: boolean }>();
  let persistenceEnabled = true;
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
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
      for (const table of ['ordenes', 'inventario', 'tecnicos', 'movimientos_inventario', 'configuracion_taller']) {
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
        for (let i = 0; i < store.length; i++) {
          if (matches(store[i])) {
            const previous = store[i];
            const next = stampRow({ ...store[i], ...clone(pendingUpdateFields) }, previous);
            const validationError = configError([next]);
            if (validationError) return { data: null, error: validationError };
            store[i] = next;
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
    async rpc(name: string, args: Record<string, any> = {}): Promise<{data:any;error:any}> {
      if (['resumen_caja','cerrar_caja','reingreso_garantia','asignar_repuesto'].includes(name)) {
        restoreTables();
        const day=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
        tables.cortes_caja??=[]; tables.consumos_repuestos??=[];
        try {
          if(name==='resumen_caja'||name==='cerrar_caja') {
            const date=name==='cerrar_caja'?day():args.p_fecha;
            const orders=tables.ordenes.filter(o=>o.estado==='Entregado'&&o.entregado_at&&day(new Date(o.entregado_at))===date);
            const sum=(method:string)=>orders.filter(o=>o.metodo_pago===method).reduce((n,o)=>n+Number(o.monto_cobrado||0),0);
            const data={fecha:date,total_efectivo:sum('Efectivo'),total_transferencia:sum('Transferencia'),sin_metodo:orders.filter(o=>!o.metodo_pago||o.monto_cobrado==null).length,gastos_repuestos:tables.consumos_repuestos.filter(o=>day(new Date(o.consumed_at))===date).reduce((n,o)=>n+o.cantidad*o.costo_unitario,0)};
            if(name==='resumen_caja')return {data,error:null};
            if(!Number.isFinite(args.p_apertura)||args.p_apertura<0)throw new Error('Apertura inválida');
            if(data.sin_metodo)throw new Error('Hay entregas sin método de pago');
            if(tables.cortes_caja.some(c=>c.fecha===date))throw new Error('La caja ya está cerrada');
            const closed={...data,id:'CAJA-'+date,monto_apertura:args.p_apertura,total_neto:Math.round((args.p_apertura+data.total_efectivo+data.total_transferencia-data.gastos_repuestos)*100)/100,cerrado_por:'Demo',observaciones:args.p_observaciones||'',created_at:new Date().toISOString()};tables.cortes_caja.push(closed);persistTables();return {data:clone(closed),error:null};
          }
          const o=tables.ordenes.find(o=>o.id===args.p_order_id);if(!o)throw new Error('Orden no encontrada');
          if(name==='reingreso_garantia') {
            const elapsed=Date.now()-Date.parse(o.entregado_at);if(o.estado!=='Entregado'||!Number.isFinite(elapsed)||elapsed<0||elapsed>=o.garantia_dias*86400000||o.parent_order_id)throw new Error('Garantía no vigente');
            if(String(args.p_motivo||'').trim().length<3)throw new Error('Indica motivo');
            const n=Math.max(0,...tables.ordenes.filter(c=>c.parent_order_id===o.id).map(c=>Number(c.id.split('-G').pop())))+1;
            const child={...clone(o),id:o.id+'-G'+n,parent_order_id:o.id,motivo_garantia:args.p_motivo,estado:'Garantía',estado_actualizado_at:new Date().toISOString(),ubicacion_fisica:null,entregado_at:null,metodo_pago:null,monto_cobrado:null,costo_mano_obra:0,total_estimado:0,repuestos_asignados:[],fotos_evidencia:[],checklist_json:{},falla_declarada:args.p_motivo,created_at:new Date().toISOString(),notas_tecnicas:[{id:crypto.randomUUID(),autor:'Recepción',contenido:'Reingreso asignado a '+(o.tecnico_nombre||'Por asignar')+': '+args.p_motivo,fecha:new Date().toISOString(),tipo:'general'}]};tables.ordenes.unshift(child);persistTables();notify({eventType:'INSERT',schema:'public',table:'ordenes',new:child,old:{}});return {data:clone(child),error:null};
          }
          const i=tables.inventario.find(i=>i.sku===args.p_sku);if(!i||!Number.isInteger(args.p_cantidad)||args.p_cantidad<=0||i.stock_actual<args.p_cantidad||o.estado==='Entregado')throw new Error('Stock insuficiente o cantidad inválida');
          if(tables.cortes_caja.some(c=>c.fecha===day()))throw new Error('Caja cerrada');
          i.stock_actual-=args.p_cantidad;const part={id:crypto.randomUUID(),nombre:i.nombre,sku:i.sku,cantidad:args.p_cantidad,precioUnitario:i.precio_venta};o.repuestos_asignados=[...(o.repuestos_asignados||[]),part];o.total_estimado=Number(o.costo_mano_obra)+o.repuestos_asignados.reduce((n:number,p:any)=>n+p.cantidad*p.precioUnitario,0);tables.consumos_repuestos.push({id:crypto.randomUUID(),orden_id:o.id,sku:i.sku,cantidad:args.p_cantidad,costo_unitario:i.costo_compra,consumed_at:new Date().toISOString()});persistTables();notify({eventType:'UPDATE',schema:'public',table:'ordenes',new:o,old:{}});return {data:clone(o),error:null};
        }catch(e){return {data:null,error:{message:(e as Error).message}};}
      }
      if (name !== 'get_order_tracking') return { data: null, error: { code: 'PGRST202', message: 'Función no encontrada.' } };
      const id = args?.p_order_id;
      if (typeof id !== 'string' || id.length > 64 || !/^OS-[0-9]+(-G[0-9]+)?$/.test(id) || /\s/.test(id)) return { data: null, error: null };
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
