import React, { useState, useEffect } from 'react';
import {
  initialWorkshopConfig,
  initialTechnicians,
  initialInventoryMovements,
} from './data/initialData';
import {
  Order,
  OrderStatus,
  Technician,
  InventoryItem,
  InventoryMovement,
  Client,
  WorkshopConfig,
  TechNote,
  AssignedPart,
  WhatsAppTemplateKey
} from './types';
import { defaultWhatsAppTemplates } from './lib/whatsapp';
import { Sidebar, TabType } from './components/Sidebar';
import { Header } from './components/Header';
import { MetricCards } from './components/MetricCards';
import { OrdersTable } from './components/OrdersTable';
import { TechniciansPanel } from './components/TechniciansPanel';
import { InventoryMovementsPanel } from './components/InventoryMovementsPanel';
import { ClientsView } from './components/ClientsView';
import { InventoryView } from './components/InventoryView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { NewOrderWizardModal } from './components/NewOrderWizardModal';
import { DeviceDetailDrawer } from './components/DeviceDetailDrawer';
import { ThermalReceiptModal } from './components/ThermalReceiptModal';
import { WhatsAppPreviewModal } from './components/WhatsAppPreviewModal';
import { LoginView } from './components/LoginView';
import { supabase } from './lib/supabase';

export default function App() {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Navigation State
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [collapsedSidebar, setCollapsedSidebar] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [tableStatusFilter, setTableStatusFilter] = useState<string>('Todos');

  // Database Data States
  const [orders, setOrders] = useState<Order[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>(() => {
    try {
      const saved = localStorage.getItem('celmart_technicians');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Error cargando técnicos guardados:', e);
    }
    return initialTechnicians;
  });
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>(initialInventoryMovements);
  const [clients, setClients] = useState<Client[]>([]);
  const [config, setConfig] = useState<WorkshopConfig>(() => {
    try {
      const saved = localStorage.getItem('celmart_workshop_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...initialWorkshopConfig,
          ...parsed,
          plantillasWhatsApp: {
            ...defaultWhatsAppTemplates,
            ...(parsed.plantillasWhatsApp || {})
          }
        };
      }
    } catch (e) {
      console.warn('Error cargando configuración guardada:', e);
    }
    return initialWorkshopConfig;
  });
  const [loading, setLoading] = useState(true);

  // Modals & Drawers State
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [selectedOrderForDrawer, setSelectedOrderForDrawer] = useState<Order | null>(null);
  const [selectedOrderForPrint, setSelectedOrderForPrint] = useState<Order | null>(null);
  const [selectedOrderForWhatsApp, setSelectedOrderForWhatsApp] = useState<Order | null>(null);
  const [selectedWhatsAppTemplateKey, setSelectedWhatsAppTemplateKey] = useState<WhatsAppTemplateKey | undefined>(undefined);

  const handleOpenWhatsApp = (order: Order, templateKey?: WhatsAppTemplateKey) => {
    setSelectedOrderForWhatsApp(order);
    setSelectedWhatsAppTemplateKey(templateKey);
  };

  const handleWhatsAppSent = (orderId: string, logNote: string) => {
    handleAddNoteToOrder(orderId, logNote, 'general');
  };

  // 1. Cargar datos iniciales desde Supabase
  const fetchData = async () => {
    setLoading(true);
    try {
      // Cargar Órdenes
      const { data: ordenesData } = await supabase
        .from('ordenes')
        .select('*')
        .order('created_at', { ascending: false });

      if (ordenesData) {
        const mappedOrders: Order[] = ordenesData.map((o: any) => ({
          id: o.id,
          prioridadUrgente: o.prioridad_urgente,
          cliente: {
            nombre: o.cliente_nombre,
            telefono: o.cliente_telefono,
            email: o.cliente_email,
          },
          dispositivo: {
            marca: o.dispositivo_marca,
            modelo: o.dispositivo_modelo,
            imei: o.dispositivo_imei,
            color: o.dispositivo_color,
            claveBloqueo: o.dispositivo_clave,
          },
          estado: o.estado as OrderStatus,
          tecnico: o.tecnico_nombre
            ? { nombre: o.tecnico_nombre, iniciales: o.tecnico_iniciales || 'TC' }
            : null,
          ingreso: o.ingreso,
          fallaDeclarada: o.falla_declarada,
          preDiagnostico: o.pre_diagnostico,
          observacionesFisicas: o.observaciones_fisicas,
          checklist: { equipoApagado: o.equipo_apagado, camaras: true, carga: true, wifi: true, botones: true, cristales: true, biometria: true, audio: true, chasis: true },
          notasTecnicas: [],
          repuestosAsignados: [],
          costoManoObra: Number(o.costo_mano_obra),
          totalEstimado: Number(o.total_estimado),
          garantiaDias: o.garantia_dias,
        }));
        setOrders(mappedOrders);
      }

      // Cargar Clientes
      const { data: clientesData } = await supabase.from('clientes').select('*');
      if (clientesData) {
        setClients(
          clientesData.map((c: any) => ({
            id: c.id,
            nombre: c.nombre,
            telefono: c.telefono,
            email: c.email,
            reparacionesRealizadas: c.reparaciones_realizadas,
            saldoPendiente: Number(c.saldo_pendiente),
            ultimaVisita: c.ultima_visita,
            dispositivosFrecuentes: ['Móvil'],
          }))
        );
      }

      // Cargar Inventario
      const { data: inventarioData } = await supabase.from('inventario').select('*');
      if (inventarioData) {
        setInventory(
          inventarioData.map((i: any) => ({
            id: i.id,
            nombre: i.nombre,
            sku: i.sku,
            categoria: i.categoria,
            stockActual: i.stock_actual,
            stockMinimo: i.stock_minimo,
            costoCompra: Number(i.costo_compra),
            precioVenta: Number(i.precio_venta),
            compatibilidad: i.compatibilidad,
            ubicacion: i.ubicacion,
          }))
        );
      }

      // Cargar Técnicos desde Supabase
      const { data: tecnicosData } = await supabase.from('tecnicos').select('*');
      if (tecnicosData && tecnicosData.length > 0) {
        const mappedTechs: Technician[] = tecnicosData.map((t: any) => ({
          id: t.id,
          nombre: t.nombre,
          iniciales: t.iniciales || t.nombre.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase(),
          especialidad: t.especialidad || 'General',
          estado: t.estado || 'Disponible',
          ordenesActivas: t.ordenes_activas !== undefined ? t.ordenes_activas : (t.ordenesActivas || 0),
          capacidadMaxima: t.capacidad_maxima !== undefined ? t.capacidad_maxima : (t.capacidadMaxima || 5),
          horasPromedio: t.horas_promedio || 2.5,
          efectividad: t.efectividad || 98,
          salarioFijo: t.salario_fijo || 16000,
          avatarBg: t.avatar_bg || 'bg-blue-600',
        }));
        setTechnicians(mappedTechs);
        localStorage.setItem('celmart_technicians', JSON.stringify(mappedTechs));
      }

      // Cargar Movimientos de Inventario desde Supabase
      const { data: movsData } = await supabase.from('movimientos_inventario').select('*').order('created_at', { ascending: false });
      if (movsData && movsData.length > 0) {
        setMovements(
          movsData.map((m: any) => ({
            id: m.id,
            repuestoNombre: m.repuesto_nombre || m.repuestoNombre,
            codigoOrden: m.codigo_orden || m.codigoOrden,
            tipo: m.tipo,
            cantidad: Number(m.cantidad),
            autor: m.autor,
            tiempo: m.tiempo || 'Reciente',
          }))
        );
      } else {
        setMovements([]);
      }
    } catch (err) {
      console.error('Error conectando con Supabase:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const nextOrderNumber =
    orders.length > 0
      ? Math.max(
          ...orders.map((o) => {
            const num = parseInt(o.id.replace('OS-', ''), 10);
            return isNaN(num) ? 2400 : num;
          })
        ) + 1
      : 2401;

  const displayedOrders = orders.filter((order) => {
    if (!globalSearch.trim()) return true;
    const q = globalSearch.toLowerCase().trim();
    return (
      order.id.toLowerCase().includes(q) ||
      order.cliente.nombre.toLowerCase().includes(q) ||
      order.cliente.telefono.includes(q) ||
      order.dispositivo.modelo.toLowerCase().includes(q) ||
      order.dispositivo.imei.toLowerCase().includes(q)
    );
  });

  const urgentOrdersCount = orders.filter((o) => o.prioridadUrgente && o.estado !== 'Entregado').length;
  const lowStockCount = inventory.filter((i) => i.stockActual <= i.stockMinimo).length;

  // Guardar nueva orden en Supabase
  const handleSaveNewOrder = async (newOrder: Order, printNow: boolean) => {
    const { error } = await supabase.from('ordenes').insert([
      {
        id: newOrder.id,
        prioridad_urgente: newOrder.prioridadUrgente,
        cliente_nombre: newOrder.cliente.nombre,
        cliente_telefono: newOrder.cliente.telefono,
        cliente_email: newOrder.cliente.email,
        dispositivo_marca: newOrder.dispositivo.marca,
        dispositivo_modelo: newOrder.dispositivo.modelo,
        dispositivo_imei: newOrder.dispositivo.imei,
        dispositivo_color: newOrder.dispositivo.color,
        dispositivo_clave: newOrder.dispositivo.claveBloqueo,
        estado: newOrder.estado,
        tecnico_nombre: newOrder.tecnico?.nombre,
        tecnico_iniciales: newOrder.tecnico?.iniciales,
        ingreso: newOrder.ingreso,
        falla_declarada: newOrder.fallaDeclarada,
        pre_diagnostico: newOrder.preDiagnostico,
        observaciones_fisicas: newOrder.observacionesFisicas,
        equipo_apagado: newOrder.checklist.equipoApagado,
        costo_mano_obra: newOrder.costoManoObra,
        total_estimado: newOrder.totalEstimado,
        garantia_dias: newOrder.garantiaDias,
      },
    ]);

    if (!error) {
      await fetchData();
      if (printNow) setSelectedOrderForPrint(newOrder);
    } else {
      console.error('Error insertando orden:', error);
    }
  };

  // Actualizar estado de orden en Supabase
  const handleUpdateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, estado: newStatus } : o)));
    await supabase.from('ordenes').update({ estado: newStatus }).eq('id', orderId);
  };

  // Eliminar orden definitivamente de la base de datos
  const handleDeleteOrder = async (orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    if (selectedOrderForDrawer?.id === orderId) setSelectedOrderForDrawer(null);
    if (selectedOrderForPrint?.id === orderId) setSelectedOrderForPrint(null);
    if (selectedOrderForWhatsApp?.id === orderId) setSelectedOrderForWhatsApp(null);

    const { error } = await supabase.from('ordenes').delete().eq('id', orderId);
    if (error) {
      console.error('Error eliminando orden:', error);
    }
  };

  // Gestión de Técnicos: CRUD completo y actualizaciones dinámicas
  const handleAddTechnician = async (newTechData: Omit<Technician, 'id' | 'ordenesActivas'>) => {
    const initials = newTechData.nombre
      .trim()
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0].toUpperCase())
      .join('')
      .slice(0, 2) || 'TC';

    const colors = ['bg-blue-600', 'bg-emerald-600', 'bg-purple-600', 'bg-amber-600', 'bg-rose-600', 'bg-cyan-600'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newTech: Technician = {
      id: `tech-${Date.now()}`,
      ...newTechData,
      iniciales: initials,
      ordenesActivas: 0,
      horasPromedio: 2.5,
      efectividad: 98.5,
      salarioFijo: newTechData.salarioFijo || 16000,
      avatarBg: randomColor,
    };

    const updated = [...technicians, newTech];
    setTechnicians(updated);
    try {
      localStorage.setItem('celmart_technicians', JSON.stringify(updated));
    } catch (e) {
      console.warn('Error guardando en localStorage:', e);
    }

    await supabase.from('tecnicos').insert([
      {
        id: newTech.id,
        nombre: newTech.nombre,
        iniciales: newTech.iniciales,
        especialidad: newTech.especialidad,
        estado: newTech.estado,
        ordenes_activas: newTech.ordenesActivas,
        capacidad_maxima: newTech.capacidadMaxima,
        horas_promedio: newTech.horasPromedio,
        efectividad: newTech.efectividad,
        salario_fijo: newTech.salarioFijo,
        avatar_bg: newTech.avatarBg,
      },
    ]);
  };

  const handleEditTechnician = async (updatedTech: Technician) => {
    const initials = updatedTech.nombre
      .trim()
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0].toUpperCase())
      .join('')
      .slice(0, 2) || updatedTech.iniciales || 'TC';

    const finalTech = { ...updatedTech, iniciales: initials };
    const updated = technicians.map((t) => (t.id === finalTech.id ? finalTech : t));
    setTechnicians(updated);
    try {
      localStorage.setItem('celmart_technicians', JSON.stringify(updated));
    } catch (e) {
      console.warn('Error guardando en localStorage:', e);
    }

    await supabase.from('tecnicos').update({
      nombre: finalTech.nombre,
      iniciales: finalTech.iniciales,
      especialidad: finalTech.especialidad,
      estado: finalTech.estado,
      capacidad_maxima: finalTech.capacidadMaxima,
      salario_fijo: finalTech.salarioFijo,
    }).eq('id', finalTech.id);
  };

  const handleDeleteTechnician = async (techId: string) => {
    const updated = technicians.filter((t) => t.id !== techId);
    setTechnicians(updated);
    try {
      localStorage.setItem('celmart_technicians', JSON.stringify(updated));
    } catch (e) {
      console.warn('Error guardando en localStorage:', e);
    }

    await supabase.from('tecnicos').delete().eq('id', techId);
  };

  const handleUpdateTechnicianStatus = async (techId: string, newStatus: Technician['estado']) => {
    const updated = technicians.map((t) => (t.id === techId ? { ...t, estado: newStatus } : t));
    setTechnicians(updated);
    try {
      localStorage.setItem('celmart_technicians', JSON.stringify(updated));
    } catch (e) {
      console.warn('Error guardando en localStorage:', e);
    }

    await supabase.from('tecnicos').update({ estado: newStatus }).eq('id', techId);
  };

  const handleUpdateTechnicianSpecialty = async (techId: string, newSpecialty: string) => {
    const updated = technicians.map((t) => (t.id === techId ? { ...t, especialidad: newSpecialty } : t));
    setTechnicians(updated);
    try {
      localStorage.setItem('celmart_technicians', JSON.stringify(updated));
    } catch (e) {
      console.warn('Error guardando en localStorage:', e);
    }

    await supabase.from('tecnicos').update({ especialidad: newSpecialty }).eq('id', techId);
  };

  const handleAddNoteToOrder = (orderId: string, content: string, tipo: TechNote['tipo'] = 'diagnostico') => {
    const now = new Date();
    const formattedDate = `${now.getDate()} Ago ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const newNote: TechNote = { id: `note-${Date.now()}`, autor: 'Técnico', fecha: formattedDate, contenido: content, tipo };
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, notasTecnicas: [newNote, ...o.notasTecnicas] } : o))
    );
  };

  const handleAssignPartToOrder = async (orderId: string, part: AssignedPart) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id === orderId) {
          const updatedParts = [...o.repuestosAsignados, part];
          return {
            ...o,
            repuestosAsignados: updatedParts,
            totalEstimado: o.costoManoObra + updatedParts.reduce((s, p) => s + p.precioUnitario * p.cantidad, 0),
          };
        }
        return o;
      })
    );

    // Registrar movimiento real
    const newMovement: InventoryMovement = {
      id: `mov-${Date.now()}`,
      repuestoNombre: part.nombre,
      codigoOrden: orderId,
      tipo: 'consumo',
      cantidad: -part.cantidad,
      autor: 'Taller',
      tiempo: 'Ahora',
    };
    setMovements((prev) => [newMovement, ...prev]);

    await supabase.from('movimientos_inventario').insert([
      {
        id: newMovement.id,
        repuesto_nombre: newMovement.repuestoNombre,
        codigo_orden: newMovement.codigoOrden,
        tipo: newMovement.tipo,
        cantidad: newMovement.cantidad,
        autor: newMovement.autor,
        tiempo: newMovement.tiempo,
      },
    ]);
  };

  const handleUpdateInventoryStock = async (itemId: string, delta: number) => {
    const item = inventory.find((i) => i.id === itemId);
    if (!item) return;
    const newStock = Math.max(0, item.stockActual + delta);
    setInventory((prev) => prev.map((i) => (i.id === itemId ? { ...i, stockActual: newStock } : i)));
    await supabase.from('inventario').update({ stock_actual: newStock }).eq('id', itemId);

    // Registrar movimiento real de inventario
    const newMovement: InventoryMovement = {
      id: `mov-${Date.now()}`,
      repuestoNombre: item.nombre,
      tipo: delta > 0 ? 'reabastecimiento' : 'consumo',
      cantidad: delta,
      autor: 'Administrador',
      tiempo: 'Ahora',
    };
    setMovements((prev) => [newMovement, ...prev]);

    await supabase.from('movimientos_inventario').insert([
      {
        id: newMovement.id,
        repuesto_nombre: newMovement.repuestoNombre,
        tipo: newMovement.tipo,
        cantidad: newMovement.cantidad,
        autor: newMovement.autor,
        tiempo: newMovement.tiempo,
      },
    ]);
  };

  const handleAddInventoryItem = async (newItem: Omit<InventoryItem, 'id'>) => {
    const { error } = await supabase.from('inventario').insert([
      {
        nombre: newItem.nombre,
        sku: newItem.sku,
        categoria: newItem.categoria,
        stock_actual: newItem.stockActual,
        stock_minimo: newItem.stockMinimo,
        costo_compra: newItem.costoCompra,
        precio_venta: newItem.precioVenta,
        compatibilidad: newItem.compatibilidad,
        ubicacion: newItem.ubicacion,
      },
    ]);
    if (!error) fetchData();
  };

  const handleEditInventoryItem = async (updatedItem: InventoryItem) => {
    setInventory((prev) => prev.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
    await supabase.from('inventario').update({
      nombre: updatedItem.nombre,
      sku: updatedItem.sku,
      stock_actual: updatedItem.stockActual,
      precio_venta: updatedItem.precioVenta,
    }).eq('id', updatedItem.id);
  };

  const handleDeleteInventoryItem = async (itemId: string) => {
    setInventory((prev) => prev.filter((i) => i.id !== itemId));
    await supabase.from('inventario').delete().eq('id', itemId);
  };

  const handleAddClient = async (
    newClientData: Omit<Client, 'id' | 'reparacionesRealizadas' | 'saldoPendiente' | 'ultimaVisita'>
  ) => {
    const { error } = await supabase.from('clientes').insert([
      {
        nombre: newClientData.nombre,
        telefono: newClientData.telefono,
        email: newClientData.email,
      },
    ]);
    if (!error) fetchData();
  };

  const handleSaveConfig = async (updated: WorkshopConfig) => {
    setConfig(updated);
    try {
      localStorage.setItem('celmart_workshop_config', JSON.stringify(updated));
    } catch (err) {
      console.warn('Error guardando configuración en localStorage:', err);
    }
  };

  // Calcular carga activa real de cada técnico según órdenes no finalizadas
  const techniciansWithRealLoad = technicians.map((tech) => {
    const activeOrders = orders.filter(
      (o) => o.tecnico?.nombre === tech.nombre && o.estado !== 'Entregado' && o.estado !== 'Listo'
    ).length;
    return {
      ...tech,
      ordenesActivas: activeOrders,
    };
  });

  if (!isAuthenticated) {
    return <LoginView onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="flex h-screen w-full bg-[#0c0c0e] text-zinc-100 overflow-hidden font-sans select-text">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          setMobileMenuOpen(false);
          if (globalSearch) setGlobalSearch('');
        }}
        collapsed={collapsedSidebar}
        setCollapsed={setCollapsedSidebar}
        activeOrdersCount={orders.filter((o) => o.estado !== 'Entregado').length}
        lowStockCount={lowStockCount}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Header
          globalSearch={globalSearch}
          setGlobalSearch={setGlobalSearch}
          onOpenNewOrder={() => setIsNewOrderModalOpen(true)}
          urgentOrdersCount={urgentOrdersCount}
          onLogout={() => setIsAuthenticated(false)}
          onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {activeTab === 'dashboard' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <MetricCards orders={orders} onSelectFilter={(st) => setTableStatusFilter(st)} />
              <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                <div className="lg:col-span-2 xl:col-span-3">
                  <OrdersTable
                    orders={displayedOrders}
                    selectedFilter={tableStatusFilter}
                    setSelectedFilter={setTableStatusFilter}
                    onSelectOrder={(order) => setSelectedOrderForDrawer(order)}
                    onPrintTicket={(order) => setSelectedOrderForPrint(order)}
                    onOpenWhatsApp={handleOpenWhatsApp}
                    onUpdateOrderStatus={handleUpdateOrderStatus}
                    onDeleteOrder={handleDeleteOrder}
                  />
                </div>
                <div className="space-y-6">
                  <TechniciansPanel
                    technicians={techniciansWithRealLoad}
                    onSelectTechnician={(name) => {
                      setGlobalSearch(name);
                      setActiveTab('dashboard');
                    }}
                    onAddTechnician={handleAddTechnician}
                    onEditTechnician={handleEditTechnician}
                    onDeleteTechnician={handleDeleteTechnician}
                    onUpdateTechnicianStatus={handleUpdateTechnicianStatus}
                    onUpdateTechnicianSpecialty={handleUpdateTechnicianSpecialty}
                  />
                  <InventoryMovementsPanel movements={movements} onGoToInventory={() => setActiveTab('inventario')} />
                </div>
              </div>
            </div>
          )}
          {activeTab === 'clientes' && (
            <div className="animate-in fade-in duration-150">
              <ClientsView
                clients={clients}
                orders={orders}
                onAddClient={handleAddClient}
                onSelectClientOrders={(name) => { setGlobalSearch(name); setActiveTab('dashboard'); }}
                onOpenWhatsApp={handleOpenWhatsApp}
              />
            </div>
          )}
          {activeTab === 'inventario' && (
            <div className="animate-in fade-in duration-150">
              <InventoryView
                inventory={inventory}
                onUpdateStock={handleUpdateInventoryStock}
                onAddInventoryItem={handleAddInventoryItem}
                onEditInventoryItem={handleEditInventoryItem}
                onDeleteInventoryItem={handleDeleteInventoryItem}
              />
            </div>
          )}
          {activeTab === 'reportes' && (
            <div className="animate-in fade-in duration-150">
              <ReportsView orders={orders} inventory={inventory} />
            </div>
          )}
          {activeTab === 'configuraciones' && (
            <div className="animate-in fade-in duration-150">
              <SettingsView config={config} onSaveConfig={handleSaveConfig} />
            </div>
          )}
        </main>
      </div>

      <NewOrderWizardModal
        isOpen={isNewOrderModalOpen}
        onClose={() => setIsNewOrderModalOpen(false)}
        onSaveOrder={handleSaveNewOrder}
        existingClients={clients}
        technicians={techniciansWithRealLoad}
        nextOrderNumber={nextOrderNumber}
      />
      <DeviceDetailDrawer
        order={selectedOrderForDrawer}
        isOpen={!!selectedOrderForDrawer}
        onClose={() => setSelectedOrderForDrawer(null)}
        onUpdateStatus={handleUpdateOrderStatus}
        onAddNote={handleAddNoteToOrder}
        onAssignPart={handleAssignPartToOrder}
        onPrintTicket={(order) => setSelectedOrderForPrint(order)}
        onOpenWhatsApp={handleOpenWhatsApp}
        inventory={inventory}
      />
      <ThermalReceiptModal
        order={selectedOrderForPrint}
        isOpen={!!selectedOrderForPrint}
        onClose={() => setSelectedOrderForPrint(null)}
        config={config}
      />
      <WhatsAppPreviewModal
        order={selectedOrderForWhatsApp}
        isOpen={!!selectedOrderForWhatsApp}
        onClose={() => {
          setSelectedOrderForWhatsApp(null);
          setSelectedWhatsAppTemplateKey(undefined);
        }}
        config={config}
        initialTemplateKey={selectedWhatsAppTemplateKey}
        onSentWhatsApp={handleWhatsAppSent}
      />
    </div>
  );
}