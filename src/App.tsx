import React, { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import {
  initialTechnicians,
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
import { buildDeliveryWhatsAppMessage, buildWhatsAppLink, defaultWhatsAppTemplates, determineTemplateKeyForStatus, isValidWhatsAppPhone, replaceWhatsAppVariables, sendAutomatedWhatsApp } from './lib/whatsapp';
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
import { MobileWorkshopView } from './components/MobileWorkshopView';
import { supabase } from './lib/supabase';
import { mapInventoryRow, mapOrderRow } from './lib/orderRepository';
import { cacheWorkshopConfig, loadSharedWorkshopConfig, readWorkshopConfigCache, saveSharedWorkshopConfig } from './lib/configRepository';

import { CashRegisterView } from './components/CashRegisterView';
import { warrantyActive } from './lib/operations';
import type { PaymentMethod } from './lib/operations';
import {EquipmentLabelModal} from './components/EquipmentLabelModal';
import { offlineStore, useWorkshopField, readOfflineIdentity, rememberOfflineIdentity, lockOfflineSession, sessionLocked, uniqueOrderId, mapClientRow, mapMovementRow, withSyncTimeout } from './lib/offlineRepository';
import { browserOnline, isNetworkError, type WorkshopSnapshot } from './lib/offlineSync';
export default function App() {
  const [labelOrder,setLabelOrder]=useState<Order|null>(null);
  const [selectedTechnician,setSelectedTechnician]=useState('');
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!readOfflineIdentity());

  // Navigation State
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [collapsedSidebar, setCollapsedSidebar] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [tableStatusFilter, setTableStatusFilter] = useState<string>('Todos');
  const [viewMode, setViewMode] = useState<'recepcion' | 'taller'>(() => {
    try {
      const saved = localStorage.getItem('celmart_view_mode');
      if (saved === 'recepcion' || saved === 'taller') return saved;
    } catch { /* The viewport still provides a useful default if storage is unavailable. */ }
    return window.innerWidth < 768 ? 'taller' : 'recepcion';
  });

  // Database Data States
  const [orders, setOrders] = useWorkshopField('orders');
  const syncState = useSyncExternalStore(offlineStore.subscribe, offlineStore.getSnapshot, offlineStore.getSnapshot);
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
  const [inventory, setInventory] = useWorkshopField('inventory');
  const [movements] = useWorkshopField('movements');
  const [clients] = useWorkshopField('clients');
  const [config, setConfig] = useState<WorkshopConfig>(readWorkshopConfigCache);
  const configRef = useRef(config);
  const configVersion = useRef(0);
  const [configError, setConfigError] = useState<string | null>(null);
  useEffect(() => { configRef.current = config; }, [config]);

  const refreshSharedConfig = useCallback(async () => {
    if (!browserOnline()) return;
    const version = ++configVersion.current;
    try {
      const shared = await withSyncTimeout(() => loadSharedWorkshopConfig(configRef.current));
      if (version !== configVersion.current) return;
      configRef.current = shared;
      setConfig((previous) => JSON.stringify(previous) === JSON.stringify(shared) ? previous : shared);
      cacheWorkshopConfig(shared);
      setConfigError(null);
    } catch (error) {
      if (version === configVersion.current && !isNetworkError(error) && browserOnline()) setConfigError(error instanceof Error ? error.message : 'No se pudo sincronizar la configuración. Se conserva la caché local.');
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void refreshSharedConfig();
    return () => { configVersion.current++; };
  }, [isAuthenticated, refreshSharedConfig]);
  const [loading, setLoading] = useState(() => browserOnline() && !offlineStore.getSnapshot().data.orders.length);
  const [dataError, setDataError] = useState<string | null>(null);
  const fetchVersion = useRef(0);

  // Modals & Drawers State
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [expressReception, setExpressReception] = useState(false);
  const [receptionPhoto, setReceptionPhoto] = useState<File | null>(null);
  const expressCamera = useRef<HTMLInputElement>(null);
  const [selectedOrderForDrawer, setSelectedOrderForDrawer] = useState<Order | null>(null);
  const [selectedOrderForPrint, setSelectedOrderForPrint] = useState<Order | null>(null);
  const [selectedOrderForWhatsApp, setSelectedOrderForWhatsApp] = useState<Order | null>(null);
  const [selectedWhatsAppTemplateKey, setSelectedWhatsAppTemplateKey] = useState<WhatsAppTemplateKey | undefined>(undefined);
  const [manualFallbackReason, setManualFallbackReason] = useState<string | undefined>();
  const [customWhatsAppMessage, setCustomWhatsAppMessage] = useState<string | undefined>();
  const [lastDeliveredOrder, setLastDeliveredOrder] = useState<Order | null>(null);
  const sendingReceipts = useRef(new Set<string>());
  const [automationNotice, setAutomationNotice] = useState<string | null>(null);
  const [whatsAppFallbacks, setWhatsAppFallbacks] = useState<{ order: Order; templateKey: WhatsAppTemplateKey; reason: string; message?: string }[]>([]);

  useEffect(() => {
    if (selectedOrderForWhatsApp || !whatsAppFallbacks.length) return;
    const fallback = whatsAppFallbacks[0];
    setSelectedOrderForWhatsApp(fallback.order);
    setSelectedWhatsAppTemplateKey(fallback.templateKey);
    setManualFallbackReason(fallback.reason);
    setCustomWhatsAppMessage(fallback.message);
    setWhatsAppFallbacks((previous) => previous.slice(1));
  }, [selectedOrderForWhatsApp, whatsAppFallbacks]);

  const handleOpenWhatsApp = (order: Order, templateKey?: WhatsAppTemplateKey) => {
    setCustomWhatsAppMessage(undefined);
    setManualFallbackReason(undefined);
    setSelectedOrderForWhatsApp(order);
    setSelectedWhatsAppTemplateKey(templateKey);
  };

  const handleWhatsAppSent = async (orderId: string, logNote: string) => {
    await handleAddNoteToOrder(orderId, logNote, 'general');
  };

  const handleDeliveryReceipt = async (order: Order) => {
    if (sendingReceipts.current.has(order.id)) return;
    if (offlineStore.getSnapshot().pending || offlineStore.getSnapshot().offline) { setDataError('Sincroniza la entrega antes de enviar el comprobante final. Puedes imprimir su copia local.'); return; }
    if (order.estado !== 'Entregado' || !order.fechaEntrega) {
      setDataError('Registra la entrega del equipo antes de enviar su comprobante final.');
      return;
    }
    const message = buildDeliveryWhatsAppMessage(order, config);
    if (!isValidWhatsAppPhone(order.cliente.telefono)) {
      setWhatsAppFallbacks((previous) => [...previous, { order, templateKey: 'listoEntrega', message, reason: 'Revisa el teléfono del cliente antes de enviar el comprobante.' }]);
      return;
    }
    sendingReceipts.current.add(order.id);
    setAutomationNotice(`${order.id} · Preparando comprobante final y garantía…`);
    let popup: Window | null = null;
    let communicationStarted = false;
    try {
      // Reserve during the actual tap so mobile popup blockers do not break the fallback.
      popup = window.open('about:blank', '_blank');
      if (popup) { popup.opener = null; popup.document.body.textContent = 'Preparando comprobante de CelMart…'; }
    } catch { popup?.close(); popup = null; }
    try {
      const result = await sendAutomatedWhatsApp(order, message, config);
      if (result.sentViaApi) {
        communicationStarted = true;
        popup?.close();
        setAutomationNotice(`${order.id} · Comprobante y garantía aceptados por la API de WhatsApp.`);
        await handleAddNoteToOrder(order.id, 'Solicitud de comprobante final y garantía aceptada por la API. Entrega al teléfono pendiente de confirmación.', 'general');
      } else if (popup && !popup.closed) {
        popup.location.replace(buildWhatsAppLink(order.cliente.telefono, message));
        communicationStarted = true;
        setAutomationNotice(`${order.id} · Comprobante preparado en WhatsApp. Completa el envío desde WhatsApp.${result.error ? ` ${result.error}` : ''}`);
        await handleAddNoteToOrder(order.id, 'Se abrió WhatsApp con el comprobante final y garantía. Envío manual pendiente de confirmación.', 'general');
      } else {
        setWhatsAppFallbacks((previous) => [...previous, { order, templateKey: 'listoEntrega', message, reason: result.error || 'Usa el enlace manual para enviar el comprobante y garantía.' }]);
      }
    } catch {
      if (!communicationStarted) {
        popup?.close();
        setWhatsAppFallbacks((previous) => [...previous, { order, templateKey: 'listoEntrega', message, reason: 'No se pudo abrir el comprobante. Continúa con el enlace manual.' }]);
      }
      setAutomationNotice(`${order.id} · No se pudo completar el registro del comprobante. Revisa WhatsApp antes de reenviarlo.`);
    } finally {
      sendingReceipts.current.delete(order.id);
    }
  };

  const changeViewMode = (mode: 'recepcion' | 'taller') => {
    setViewMode(mode);
    setActiveTab('dashboard');
    setMobileMenuOpen(false);
    try { localStorage.setItem('celmart_view_mode', mode); } catch { /* Preference remains active for this session. */ }
  };

  const openNewOrder = () => {
    setReceptionPhoto(null);
    setExpressReception(false);
    setIsNewOrderModalOpen(true);
  };

  const receiveExpress = () => {
    setReceptionPhoto(null);
    setExpressReception(true);
    setIsNewOrderModalOpen(true);
    // Open the native camera within the button gesture; uploads continue in the wizard.
    expressCamera.current?.click();
  };

  const notifyOrderChange = async (order: Order, templateKey: WhatsAppTemplateKey) => {
    if (!config.whatsappAutoSend || !config.whatsappApiUrl?.trim()) return;
    const template = config.plantillasWhatsApp[templateKey] || defaultWhatsAppTemplates[templateKey];
    const message = replaceWhatsAppVariables(template, order, config);
    setAutomationNotice(`${order.id} · Enviando actualización por WhatsApp…`);
    const result = await sendAutomatedWhatsApp(order, message, config);
    if (!result.sentViaApi) {
      const reason = result.error || 'La API no está disponible. Puedes continuar con WhatsApp manual.';
      setAutomationNotice(`${order.id} · ${reason}`);
      // Queue failures so an existing message draft is never replaced in the modal.
      setWhatsAppFallbacks((previous) => [...previous, { order, templateKey, reason }]);
      return;
    }
    setAutomationNotice(`${order.id} · Solicitud aceptada por la API de WhatsApp.`);
    try {
      await handleAddNoteToOrder(order.id, `Solicitud automática de WhatsApp aceptada por la API (${order.estado}). Entrega al teléfono pendiente de confirmación.`, 'general');
    } catch {
      setAutomationNotice(`${order.id} · La API aceptó la solicitud, pero no se pudo guardar la nota del envío. No la reenvíes.`);
    }
  };

  // Hydrate synchronously from the journal; network reads only replace a clean base.
  const fetchData = useCallback(async (background = false) => {
    if (!browserOnline() || offlineStore.getSnapshot().pending) { setLoading(false); return; }
    const version = ++fetchVersion.current;
    if (!background && !offlineStore.getSnapshot().data.orders.length) setLoading(true);
    const readRows = async (table: string, ordered = false) => {
      const rows: Record<string, any>[] = [];
      for (let offset = 0; ; offset += 1000) {
        const response = await withSyncTimeout<{data:Record<string,any>[]|null;error:unknown;status?:number}>(signal => {
          let query = supabase.from(table).select('*').range(offset, offset + 999);
          if (ordered) query = query.order('created_at', { ascending: false });
          return 'abortSignal' in query ? query.abortSignal(signal) : query;
        });
        if (response.error) throw Object.assign(new Error(String((response.error as {message?:unknown}).message||'No se pudo leer el servidor.')), {status:response.status});
        rows.push(...(response.data || []));
        if (!response.data || response.data.length < 1000) return rows;
      }
    };
    try {
      const [orderRows, clientRows, inventoryRows, techRows, movementRows] = await Promise.all([
        readRows('ordenes', true), readRows('clientes'), readRows('inventario'), readRows('tecnicos'), readRows('movimientos_inventario', true),
      ]);
      if (version !== fetchVersion.current || offlineStore.getSnapshot().pending) return;
      const fresh: WorkshopSnapshot = { orders: orderRows.map(mapOrderRow), clients: clientRows.map(mapClientRow), inventory: inventoryRows.map(mapInventoryRow), movements: movementRows.map(mapMovementRow) };
      await offlineStore.replaceRemote(fresh);
      if (techRows.length) {
        const mapped = techRows.map((t): Technician => ({ id:t.id, nombre:t.nombre, iniciales:t.iniciales||'TC', especialidad:t.especialidad||'General', estado:t.estado||'Disponible', ordenesActivas:t.ordenes_activas||0, capacidadMaxima:t.capacidad_maxima||5, horasPromedio:t.horas_promedio||2.5, efectividad:t.efectividad||98, salarioFijo:t.salario_fijo||16000, avatarBg:t.avatar_bg||'bg-blue-600' }));
        setTechnicians(mapped);
        try { localStorage.setItem('celmart_technicians', JSON.stringify(mapped)); } catch { /* Keep the session copy. */ }
      }
      offlineStore.networkChanged();
      setDataError(null);
    } catch (error) {
      if (isNetworkError(error) || !browserOnline()) { offlineStore.networkFailed(); setDataError(null); }
      else if (version === fetchVersion.current) setDataError(error instanceof Error ? error.message : 'No se pudieron sincronizar los datos. Se conserva la caché local.');
    } finally { if (version === fetchVersion.current) setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      if (sessionLocked()) return;
      const cachedUser = readOfflineIdentity();
      if (!browserOnline()) { if (cachedUser) { await offlineStore.bindOwner(cachedUser); if (active) setIsAuthenticated(true); } return; }
      try {
        const {data,error} = await withSyncTimeout<{data:{session:{user:{id:string}}|null};error:unknown}>(() => supabase.auth.getSession(), 4000);
        if (error) throw error;
        if (data.session?.user?.id) {
          await offlineStore.bindOwner(data.session.user.id); rememberOfflineIdentity(data.session.user.id);
          if (active) setIsAuthenticated(true);
        } else if (active) setIsAuthenticated(false);
      } catch (error) { if (active && cachedUser && isNetworkError(error)) setIsAuthenticated(true); }
    };
    void restore();
    return () => { active=false; };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    let previousPending = offlineStore.getSnapshot().pending;
    const synchronize = async (retry = false) => {
      offlineStore.networkChanged();
      if (!browserOnline()) return;
      await offlineStore.flush(retry);
      if (active && !offlineStore.getSnapshot().pending) { await fetchData(true); void refreshSharedConfig(); }
    };
    const online = () => { void synchronize(true); };
    const offline = () => { offlineStore.networkChanged(); setLoading(false); };
    const focus = () => { if (browserOnline()) void synchronize(); };
    const unsubscribe = offlineStore.subscribe(() => {
      const pending = offlineStore.getSnapshot().pending;
      if (previousPending && !pending && active) void fetchData(true);
      previousPending = pending;
    });
    window.addEventListener('online', online); window.addEventListener('offline', offline); window.addEventListener('focus', focus);
    const timer = setInterval(() => { if (browserOnline() && offlineStore.getSnapshot().pending && !offlineStore.getSnapshot().error) void synchronize(); }, 30000);
    void synchronize();
    return () => { active=false; clearInterval(timer); unsubscribe(); window.removeEventListener('online',online); window.removeEventListener('offline',offline); window.removeEventListener('focus',focus); fetchVersion.current++; };
  }, [isAuthenticated, fetchData, refreshSharedConfig]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (active) void fetchData(true); }, 80);
    };
    const refreshConfig = () => { if (active) void refreshSharedConfig(); };
    const channel = supabase.channel('celmart-workshop')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventario' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos_inventario' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tecnicos' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'configuracion_taller', filter: 'id=eq.default' }, refreshConfig)
      .subscribe((status: string) => {
        if (!active) return;
        if (status === 'SUBSCRIBED') { refresh(); refreshConfig(); }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') void fetchData(true);
      });
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refreshConfig);
    window.addEventListener('focus', refreshConfig);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refreshConfig);
      window.removeEventListener('focus', refreshConfig);
      void supabase.removeChannel(channel);
    };
  }, [isAuthenticated, fetchData, refreshSharedConfig]);

  const applySavedOrder = (savedOrder: Order) => {
    fetchVersion.current++; // Discard older fetches that could hide a just-saved change.
    setLoading(false);
    setOrders((previous) => previous.some((order) => order.id === savedOrder.id)
      ? previous.map((order) => order.id === savedOrder.id ? savedOrder : order)
      : [savedOrder, ...previous]);
    // Another mutation may have committed while this HTTP response was in flight.
    void fetchData(true);
  };

  const liveDrawerOrder = selectedOrderForDrawer ? orders.find((order) => order.id === selectedOrderForDrawer.id) ?? null : null;

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

  const handleSaveNewOrder = async (newOrder: Order, printNow: boolean) => {
    try {
      const now = new Date().toISOString();
      const candidate = { ...newOrder, id: uniqueOrderId(nextOrderNumber), fechaIngreso: now, estadoActualizadoAt: now };
      fetchVersion.current++;
      const result = await offlineStore.submit({kind:'createOrder',order:candidate});
      const saved = result.data.orders.find(order=>order.id===candidate.id) || candidate;
      setDataError(null);
      if (printNow) setSelectedOrderForPrint(saved);
      if (!result.pending) void notifyOrderChange(saved,'ingreso');
      return true;
    } catch (error) { setDataError(error instanceof Error?error.message:'No se pudo guardar la orden localmente.'); return false; }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    const previous=offlineStore.getSnapshot().data.orders.find(order=>order.id===orderId);
    if (!previous) throw new Error('La orden no está disponible en este dispositivo.');
    if (previous.estado===newStatus) return;
    fetchVersion.current++;
    const result=await offlineStore.submit({kind:'status',orderId,from:previous.estado,to:newStatus,at:new Date().toISOString()});
    const saved=result.data.orders.find(order=>order.id===orderId)!;
    if (newStatus==='Entregado') setLastDeliveredOrder(saved);
    else if (!result.pending) void notifyOrderChange(saved,determineTemplateKeyForStatus(newStatus));
  };

  // Administrative deletes are never optimistic: an unavailable API must
  // not remove a cached record that still exists on the server.
  const handleDeleteOrder=async(orderId:string)=>{
    if(!browserOnline()||offlineStore.getSnapshot().offline||offlineStore.getSnapshot().pending){setDataError('Sincroniza los cambios antes de eliminar una orden.');return;}
    if(orders.find(order=>order.id===orderId)?.estado==='Entregado'){setDataError('Las entregas con historial financiero se conservan.');return;}
    try {
      const result=await withSyncTimeout<{error:unknown}>(()=>supabase.from('ordenes').delete().eq('id',orderId));
      if(result.error)throw result.error;
      fetchVersion.current++;
      setOrders(previous=>previous.filter(order=>order.id!==orderId));
      if(selectedOrderForDrawer?.id===orderId)setSelectedOrderForDrawer(null);
      if(selectedOrderForPrint?.id===orderId)setSelectedOrderForPrint(null);
      if(selectedOrderForWhatsApp?.id===orderId)setSelectedOrderForWhatsApp(null);
    } catch(error){if(isNetworkError(error))offlineStore.networkFailed();setDataError('No se pudo eliminar la orden. Su copia local se conserva.');}
  };

  const onlineAdministration=()=>{if(!browserOnline()||offlineStore.getSnapshot().offline||offlineStore.getSnapshot().pending){setDataError('Esta operación requiere conexión y terminar la sincronización pendiente.');return false;}return true;};

  // Gestión de Técnicos: CRUD completo y actualizaciones dinámicas
  const handleAddTechnician = async (newTechData: Omit<Technician, 'id' | 'ordenesActivas'>) => {
    if(!onlineAdministration())return;
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
      id: crypto.randomUUID(),
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
    if(!onlineAdministration())return;
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
    if(!onlineAdministration())return;
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
    if(!onlineAdministration())return;
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
    if(!onlineAdministration())return;
    const updated = technicians.map((t) => (t.id === techId ? { ...t, especialidad: newSpecialty } : t));
    setTechnicians(updated);
    try {
      localStorage.setItem('celmart_technicians', JSON.stringify(updated));
    } catch (e) {
      console.warn('Error guardando en localStorage:', e);
    }

    await supabase.from('tecnicos').update({ especialidad: newSpecialty }).eq('id', techId);
  };

  const handleAddNoteToOrder = async (orderId: string, content: string, tipo: TechNote['tipo'] = 'diagnostico') => {
    if (!content.trim()) return;
    const note: TechNote={id:`note-${crypto.randomUUID()}`,autor:'Técnico',fecha:new Date().toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'}),contenido:content.trim(),tipo};
    fetchVersion.current++;
    await offlineStore.submit({kind:'note',orderId,note});
  };
  const handleAssignPartToOrder = async (orderId: string, part: AssignedPart) => {
    const item=offlineStore.getSnapshot().data.inventory.find(item=>item.sku===part.sku);
    if(!item)throw new Error('El repuesto no está disponible en este dispositivo.');
    fetchVersion.current++;
    await offlineStore.submit({kind:'assignPart',orderId,part,itemId:item.id});
  };
  const handlePayment=async(id:string,method:PaymentMethod,amount:number)=>{
    fetchVersion.current++;
    await offlineStore.submit({kind:'payment',orderId:id,method,amount});
  };
  const handleWarranty=async(id:string,reason:string)=>{
    if(!browserOnline()||offlineStore.getSnapshot().offline||offlineStore.getSnapshot().pending)throw new Error('Sincroniza las órdenes para validar el reingreso por garantía.');
    const {data,error}=await supabase.rpc('reingreso_garantia',{p_order_id:id,p_motivo:reason});
    if(error)throw new Error(error.message);const child=mapOrderRow(data);applySavedOrder(child);setSelectedOrderForDrawer(child);
    setAutomationNotice(`${child.id} · Reingreso asignado a ${child.tecnico?.nombre||'técnico pendiente'}. Aviso disponible en su cola de garantía.`);
  };

  const handleSaveLocation=async(orderId:string,value:string)=>{
    fetchVersion.current++;
    await offlineStore.submit({kind:'location',orderId,value:value.trim()});
  };
  const handleAddPhotoToOrder=async(orderId:string,url:string)=>{
    fetchVersion.current++;
    await offlineStore.submit({kind:'photo',orderId,url});
  };
  const handleUpdateInventoryStock=async(itemId:string,delta:number)=>{
    const item=offlineStore.getSnapshot().data.inventory.find(item=>item.id===itemId);
    if(!item)return;
    fetchVersion.current++;
    await offlineStore.submit({kind:'stock',itemId,delta,movement:{id:crypto.randomUUID(),repuestoNombre:item.nombre,tipo:delta>0?'reabastecimiento':'consumo',cantidad:delta,autor:'Taller',tiempo:'Ahora'}});
  };
  const handleAddInventoryItem=async(newItem:Omit<InventoryItem,'id'>)=>{
    const item={...newItem,id:crypto.randomUUID()};
    fetchVersion.current++;
    const result=await offlineStore.submit({kind:'createInventory',item});
    return result.data.inventory.find(row=>row.id===item.id)||item;
  };
  const handleEditInventoryItem=async(item:InventoryItem)=>{
    const previous=offlineStore.getSnapshot().data.inventory.find(row=>row.id===item.id);
    if(!previous)throw new Error('El repuesto no está disponible.');
    fetchVersion.current++;
    const result=await offlineStore.submit({kind:'editInventory',item,previousStock:previous.stockActual});
    return result.data.inventory.find(row=>row.id===item.id)||item;
  };

  const handleDeleteInventoryItem=async(itemId:string)=>{
    if(!browserOnline()||offlineStore.getSnapshot().offline||offlineStore.getSnapshot().pending){setDataError('Sincroniza los cambios antes de eliminar un repuesto.');return;}
    try {
      const result=await withSyncTimeout<{error:unknown}>(()=>supabase.from('inventario').delete().eq('id',itemId));
      if(result.error)throw result.error;
      fetchVersion.current++;
      setInventory(previous=>previous.filter(item=>item.id!==itemId));
    } catch(error){if(isNetworkError(error))offlineStore.networkFailed();setDataError('No se pudo eliminar el repuesto. Su copia local se conserva.');}
  };

  const handleAddClient=async(data:Omit<Client,'id'|'reparacionesRealizadas'|'saldoPendiente'|'ultimaVisita'>)=>{
    const client={...data,id:crypto.randomUUID(),reparacionesRealizadas:0,saldoPendiente:0,ultimaVisita:'Hoy'};
    fetchVersion.current++;
    await offlineStore.submit({kind:'createClient',client});
  };

  const handleSaveConfig = async (updated: WorkshopConfig) => {
    if(!browserOnline()||offlineStore.getSnapshot().offline)throw new Error('Reconecta para guardar la configuración compartida.');
    configVersion.current++;
    const saved = await saveSharedWorkshopConfig(updated);
    configVersion.current++;
    configRef.current = saved;
    setConfig(saved);
    setConfigError(cacheWorkshopConfig(saved) ? null : 'Configuración guardada en Supabase. No se pudo actualizar la caché de este navegador.');
    void refreshSharedConfig();
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
    return <LoginView onLogin={async userId=>{await offlineStore.bindOwner(userId);rememberOfflineIdentity(userId);setIsAuthenticated(true);}} />;
  }

  return (
    <div className="flex h-dvh w-full bg-[#0c0c0e] text-zinc-100 overflow-hidden font-sans select-text">
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
        <Header onDiscardSync={()=>{void offlineStore.discardRejected().then(()=>offlineStore.flush(true)).then(()=>fetchData(true)).catch(error=>setDataError(error.message));}} syncState={syncState} onRetrySync={()=>{void offlineStore.flush(true).then(()=>fetchData(true));}} warrantyNotifications={orders.filter(o=>o.parentOrderId&&o.estado==='Garantía').map(o=>({id:o.id,technician:o.tecnico?.nombre||'Por asignar'}))} onOpenWarranty={id=>setSelectedOrderForDrawer(orders.find(o=>o.id===id)||null)}
          globalSearch={globalSearch}
          setGlobalSearch={setGlobalSearch}
          onOpenNewOrder={openNewOrder}
          viewMode={viewMode}
          onViewModeChange={changeViewMode}
          urgentOrdersCount={urgentOrdersCount}
          onLogout={()=>{lockOfflineSession();setIsAuthenticated(false);void supabase.auth.signOut();}}
          onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
        />
        <main className={`flex-1 overflow-y-auto min-h-0 ${viewMode === 'taller' && activeTab === 'dashboard' ? 'p-0' : 'p-4 sm:p-6'} space-y-4`}>
          {automationNotice && (
            <div role="status" className="rounded-lg border border-emerald-900/60 bg-emerald-950/25 p-3 text-sm text-emerald-200 flex items-center justify-between gap-3">
              <span>{automationNotice}</span>
              <button type="button" onClick={() => setAutomationNotice(null)} aria-label="Cerrar aviso de WhatsApp" className="min-w-11 min-h-11">✕</button>
            </div>
          )}
          {dataError && (
            <div role="alert" className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 text-sm text-amber-200 flex flex-wrap items-center justify-between gap-3">
              <span>{dataError}</span>
              <button type="button" onClick={() => void fetchData(true)} className="underline underline-offset-4">Volver a sincronizar</button>
            </div>
          )}
          {configError && (
            <div role="alert" className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 text-sm text-amber-200 flex flex-wrap items-center justify-between gap-3">
              <span>{configError}</span>
              <button type="button" onClick={() => void refreshSharedConfig()} className="underline">Sincronizar configuración</button>
            </div>
          )}
          {loading && <p role="status" className="text-sm text-zinc-400">Cargando datos del taller…</p>}
          {globalSearch.trim() && activeTab === 'dashboard' && displayedOrders.filter(o=>warrantyActive(o)&&!o.parentOrderId).slice(0,5).map(o=><button key={o.id} onClick={()=>setSelectedOrderForDrawer(o)} className="block px-3 py-2 rounded-md border border-zinc-800/80 bg-[#161619] text-xs text-zinc-300">{o.id} · Registrar Reingreso por Garantía</button>)}
          {activeTab === 'dashboard' && viewMode === 'taller' && (
            <MobileWorkshopView technicians={technicians} onTechnicianChange={setSelectedTechnician} selectedTechnician={selectedTechnician} onSaveLocation={handleSaveLocation} onPrintLabel={setLabelOrder}
              orders={orders}
              searchQuery={globalSearch}
              onSearchChange={setGlobalSearch}
              onReceiveExpress={receiveExpress}
              onSelectOrder={setSelectedOrderForDrawer}
              onUpdateStatus={handleUpdateOrderStatus}
              onAddPhoto={handleAddPhotoToOrder}
              onAddNote={handleAddNoteToOrder}
              onOpenWhatsApp={handleOpenWhatsApp}
              lastDeliveredOrder={lastDeliveredOrder ? orders.find((order) => order.id === lastDeliveredOrder.id) ?? lastDeliveredOrder : null}
              onDeliveryReceipt={(order) => { void handleDeliveryReceipt(order); }}
            />
          )}
          {activeTab === 'dashboard' && viewMode === 'recepcion' && (
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
                    onUpdateOrderStatus={(orderId, status) => { void handleUpdateOrderStatus(orderId, status).catch((error: Error) => setDataError(error.message)); }}
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
          {activeTab === 'caja' && <CashRegisterView width={config.anchoTicket}/>}
          {activeTab === 'inventario' && (
            <div className="animate-in fade-in duration-150">
              <InventoryView
                inventory={inventory}
                onUpdateStock={(id,delta)=>{void handleUpdateInventoryStock(id,delta).catch(error=>setDataError(error.message));}}
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
        onClose={() => { setIsNewOrderModalOpen(false); setReceptionPhoto(null); }}
        initialPhoto={receptionPhoto}
        expressReception={expressReception}
        onSaveOrder={handleSaveNewOrder}
        existingClients={clients}
        technicians={techniciansWithRealLoad}
        nextOrderNumber={nextOrderNumber}
      />
      <input
        ref={expressCamera}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Cámara para recepción exprés"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) setReceptionPhoto(file);
        }}
      />
      {labelOrder&&<EquipmentLabelModal order={orders.find(o=>o.id===labelOrder.id)||labelOrder} config={config} onClose={()=>setLabelOrder(null)}/>}
      <DeviceDetailDrawer onSaveLocation={handleSaveLocation} onPrintLabel={setLabelOrder}
        key={selectedOrderForDrawer?.id ?? 'closed'}
        order={liveDrawerOrder}
        isOpen={!!liveDrawerOrder}
        onClose={() => setSelectedOrderForDrawer(null)}
        onUpdateStatus={handleUpdateOrderStatus}
        autoWhatsApp={Boolean(config.whatsappAutoSend && config.whatsappApiUrl?.trim())}
        onAddNote={handleAddNoteToOrder}
        onPayment={handlePayment}
        onWarranty={handleWarranty}
        onAssignPart={handleAssignPartToOrder}
        onAddPhoto={handleAddPhotoToOrder}
        onDeliveryReceipt={(order) => { void handleDeliveryReceipt(order); }}
        onPrintTicket={(order) => setSelectedOrderForPrint(order)}
        onOpenWhatsApp={handleOpenWhatsApp}
        inventory={inventory}
      />
      <ThermalReceiptModal
        order={selectedOrderForPrint}
        isOpen={!!selectedOrderForPrint}
        onClose={() => setSelectedOrderForPrint(null)}
        config={config}
        onSendDelivery={(order) => { void handleDeliveryReceipt(order); }}
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
        manualFallbackReason={manualFallbackReason}
        initialMessage={customWhatsAppMessage}
        onSentWhatsApp={handleWhatsAppSent}
      />
    </div>
  );
}
