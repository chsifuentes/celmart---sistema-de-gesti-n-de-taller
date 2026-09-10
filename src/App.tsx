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
  AssignedPart
} from './types';
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
  const [globalSearch, setGlobalSearch] = useState('');
  const [tableStatusFilter, setTableStatusFilter] = useState<string>('Todos');

  // Database Data States
  const [orders, setOrders] = useState<Order[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>(initialTechnicians);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>(initialInventoryMovements);
  const [clients, setClients] = useState<Client[]>([]);
  const [config, setConfig] = useState<WorkshopConfig>(() => {
    try {
      const saved = localStorage.getItem('celmart_workshop_config');
      if (saved) {
        return { ...initialWorkshopConfig, ...JSON.parse(saved) };
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

  const handleAddNoteToOrder = (orderId: string, content: string, tipo: TechNote['tipo'] = 'diagnostico') => {
    const now = new Date();
    const formattedDate = `${now.getDate()} Ago ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const newNote: TechNote = { id: `note-${Date.now()}`, autor: 'Técnico', fecha: formattedDate, contenido: content, tipo };
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, notasTecnicas: [newNote, ...o.notasTecnicas] } : o))
    );
  };

  const handleAssignPartToOrder = (orderId: string, part: AssignedPart) => {
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
  };

  const handleUpdateInventoryStock = async (itemId: string, delta: number) => {
    const item = inventory.find((i) => i.id === itemId);
    if (!item) return;
    const newStock = Math.max(0, item.stockActual + delta);
    setInventory((prev) => prev.map((i) => (i.id === itemId ? { ...i, stockActual: newStock } : i)));
    await supabase.from('inventario').update({ stock_actual: newStock }).eq('id', itemId);
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

  if (!isAuthenticated) {
    return <LoginView onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="flex h-screen w-full bg-[#0c0c0e] text-zinc-100 overflow-hidden font-sans select-text">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          if (globalSearch) setGlobalSearch('');
        }}
        collapsed={collapsedSidebar}
        setCollapsed={setCollapsedSidebar}
        activeOrdersCount={orders.filter((o) => o.estado !== 'Entregado').length}
        lowStockCount={lowStockCount}
      />
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Header
          globalSearch={globalSearch}
          setGlobalSearch={setGlobalSearch}
          onOpenNewOrder={() => setIsNewOrderModalOpen(true)}
          urgentOrdersCount={urgentOrdersCount}
          onLogout={() => setIsAuthenticated(false)}
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
                    onOpenWhatsApp={(order) => setSelectedOrderForWhatsApp(order)}
                    onUpdateOrderStatus={handleUpdateOrderStatus}
                  />
                </div>
                <div className="space-y-6">
                  <TechniciansPanel technicians={technicians} />
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
        technicians={technicians}
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
        onOpenWhatsApp={(order) => setSelectedOrderForWhatsApp(order)}
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
        onClose={() => setSelectedOrderForWhatsApp(null)}
        config={config}
      />
    </div>
  );
}