import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
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
import { getNextOrderNumber, mapInventoryRow, mapOrderRow, orderToRow, updateOrderWithRetry } from './lib/orderRepository';
import { cacheWorkshopConfig, loadSharedWorkshopConfig, readWorkshopConfigCache, saveSharedWorkshopConfig } from './lib/configRepository';

import { CashRegisterView } from './components/CashRegisterView';
import { warrantyActive } from './lib/operations';
import type { ShiftRole, PaymentMethod } from './lib/operations';
export default function App() {
  const [shiftRole,setShiftRole]=useState<ShiftRole>('recepcion');
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

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
  const [config, setConfig] = useState<WorkshopConfig>(readWorkshopConfigCache);
  const configRef = useRef(config);
  const configVersion = useRef(0);
  const [configError, setConfigError] = useState<string | null>(null);
  useEffect(() => { configRef.current = config; }, [config]);

  const refreshSharedConfig = useCallback(async () => {
    const version = ++configVersion.current;
    try {
      const shared = await loadSharedWorkshopConfig(configRef.current);
      if (version !== configVersion.current) return;
      configRef.current = shared;
      setConfig((previous) => JSON.stringify(previous) === JSON.stringify(shared) ? previous : shared);
      cacheWorkshopConfig(shared);
      setConfigError(null);
    } catch (error) {
      if (version === configVersion.current) setConfigError(error instanceof Error ? error.message : 'No se pudo sincronizar la configuración. Se conserva la caché local.');
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void refreshSharedConfig();
    return () => { configVersion.current++; };
  }, [isAuthenticated, refreshSharedConfig]);
  const [loading, setLoading] = useState(true);
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

  // 1. Cargar datos iniciales desde Supabase
  const fetchData = useCallback(async (background = false) => {
    const version = ++fetchVersion.current;
    if (!background) setLoading(true);
    try {
      const [ordersResult, clientsResult, inventoryResult, techsResult, movementsResult] = await Promise.all([
        supabase.from('ordenes').select('*').order('created_at', { ascending: false }),
        supabase.from('clientes').select('*'),
        supabase.from('inventario').select('*'),
        supabase.from('tecnicos').select('*'),
        supabase.from('movimientos_inventario').select('*').order('created_at', { ascending: false }),
      ]);
      if (version !== fetchVersion.current) return;
      const failed = [ordersResult, clientsResult, inventoryResult, techsResult, movementsResult].find((result) => result.error);
      setDataError(failed ? `No se pudieron sincronizar todos los datos: ${failed.error.message}` : null);
      if (ordersResult.data) setOrders(ordersResult.data.map(mapOrderRow));
      const clientesData = clientsResult.data;
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
      const inventarioData = inventoryResult.data;
      if (inventarioData) {
        setInventory(inventarioData.map(mapInventoryRow));
      }

      // Cargar Técnicos desde Supabase
      const tecnicosData = techsResult.data;
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
      const movsData = movementsResult.data;
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
      } else if (!movementsResult.error) {
        setMovements([]);
      }
    } catch (err) {
      console.error('Error conectando con Supabase:', err);
      if (version === fetchVersion.current) setDataError('No se pudo conectar con Supabase. Revisa la conexión y vuelve a sincronizar.');
    } finally {
      if (version === fetchVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void fetchData();
    return () => { fetchVersion.current++; };
  }, [isAuthenticated, fetchData]);

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
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setDataError('Se perdió la sincronización en tiempo real. Comprueba la conexión y la configuración de Realtime.');
        }
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

  // Guardar nueva orden en Supabase
  const handleSaveNewOrder = async (newOrder: Order, printNow: boolean) => {
    let candidate = newOrder;
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const { error } = await supabase.from('ordenes').insert([orderToRow(candidate)]);
        if (!error) {
          applySavedOrder(candidate);
          setDataError(null);
          if (printNow) setSelectedOrderForPrint(candidate);
          void notifyOrderChange(candidate, 'ingreso');
          return true;
        }
        // Two receptions may propose the same folio. Retry against the latest rows.
        if (error.code !== '23505') throw new Error(error.message);
        candidate = { ...newOrder, id: `OS-${await getNextOrderNumber()}` };
      }
      throw new Error('No se pudo reservar el folio. Intenta guardar de nuevo.');
    } catch (error) {
      setDataError(`No se guardó la orden: ${error instanceof Error ? error.message : 'error de conexión'}`);
      return false;
    }
  };

  // Actualizar estado de orden en Supabase
  const handleUpdateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    const previous = orders.find((order) => order.id === orderId);
    if (!previous) throw new Error('La orden no está disponible. Vuelve a sincronizar.');
    if (previous.estado === newStatus) return;
    if (previous.estado==='Entregado') throw new Error('La entrega original se conserva. Usa Registrar Reingreso por Garantía.');
    if (newStatus === 'Entregado' && (!previous.metodoPago || previous.montoCobrado == null)) { setSelectedOrderForDrawer(previous); throw new Error('Registra el método y el importe cobrado en la ficha antes de entregar.'); }
    if (newStatus === 'Entregado' && previous.estado !== 'Listo') {
      throw new Error('Marca el equipo como Listo antes de registrar su entrega.');
    }
    const { data, error } = await supabase.from('ordenes').update({ estado: newStatus })
      .eq('id', orderId).eq('estado', previous.estado).select('*').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      void fetchData(true);
      throw new Error('Otra persona cambió esta orden. Revisa su estado actualizado antes de continuar.');
    }
    const saved = mapOrderRow(data);
    applySavedOrder(saved);
    if (newStatus === 'Entregado') setLastDeliveredOrder(saved);
    else void notifyOrderChange(saved, determineTemplateKeyForStatus(newStatus));
  };

  // Eliminar orden definitivamente de la base de datos
  const handleDeleteOrder = async (orderId: string) => {
    if(orders.find(o=>o.id===orderId)?.estado==='Entregado'){setDataError('Las entregas con historial financiero se conservan.');return;}
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

  const handleAddNoteToOrder = async (orderId: string, content: string, tipo: TechNote['tipo'] = 'diagnostico') => {
    if (!content.trim()) return;
    const now = new Date();
    const formattedDate = now.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
    const newNote: TechNote = { id: `note-${crypto.randomUUID()}`, autor: 'Técnico', fecha: formattedDate, contenido: content.trim(), tipo };
    const saved = await updateOrderWithRetry(orderId, ['notas_tecnicas'], (current) => ({
      notas_tecnicas: [newNote, ...current.notasTecnicas],
    }));
    applySavedOrder(saved);
  };

  const handleAssignPartToOrder = async (orderId: string, part: AssignedPart) => {
    const {data,error}=await supabase.rpc('asignar_repuesto',{p_order_id:orderId,p_sku:part.sku,p_cantidad:part.cantidad});
    if(error) throw new Error(error.message);
    applySavedOrder(mapOrderRow(data));
  };
  const handlePayment=async(id:string,method:PaymentMethod,amount:number)=>{
    if(shiftRole==='tecnico') throw new Error('Cambia al perfil de Recepción para registrar cobros.');
    if(!Number.isFinite(amount)||amount<0)throw new Error('Importe inválido');
    const {data,error}=await supabase.from('ordenes').update({metodo_pago:method,monto_cobrado:amount}).eq('id',id).select('*').single();
    if(error)throw new Error(error.message);applySavedOrder(mapOrderRow(data));
  };
  const handleWarranty=async(id:string,reason:string)=>{
    const {data,error}=await supabase.rpc('reingreso_garantia',{p_order_id:id,p_motivo:reason});
    if(error)throw new Error(error.message);const child=mapOrderRow(data);applySavedOrder(child);setSelectedOrderForDrawer(child);
    setAutomationNotice(`${child.id} · Reingreso asignado a ${child.tecnico?.nombre||'técnico pendiente'}. Aviso disponible en su cola de garantía.`);
  };

  const handleAddPhotoToOrder = async (orderId: string, photoUrl: string) => {
    const saved = await updateOrderWithRetry(orderId, ['fotos_evidencia'], (current) => ({
      fotos_evidencia: [...new Set([...(current.fotosEvidencia ?? []), photoUrl])],
    }));
    applySavedOrder(saved);
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
    const { data, error } = await supabase.from('inventario').insert([
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
        imagen_url: newItem.imagenUrl ?? null,
      },
    ]).select('*').single();
    if (error || !data) throw new Error(error?.message ?? 'No se pudo crear el repuesto.');
    const saved = mapInventoryRow(data);
    fetchVersion.current++;
    setInventory((previous) => [saved, ...previous.filter((item) => item.id !== saved.id)]);
    void fetchData(true);
    return saved;
  };

  const handleEditInventoryItem = async (updatedItem: InventoryItem) => {
    const { data, error } = await supabase.from('inventario').update({
      nombre: updatedItem.nombre,
      sku: updatedItem.sku,
      categoria: updatedItem.categoria,
      stock_actual: updatedItem.stockActual,
      stock_minimo: updatedItem.stockMinimo,
      costo_compra: updatedItem.costoCompra,
      precio_venta: updatedItem.precioVenta,
      compatibilidad: updatedItem.compatibilidad,
      ubicacion: updatedItem.ubicacion,
      imagen_url: updatedItem.imagenUrl ?? null,
    }).eq('id', updatedItem.id).select('*').maybeSingle();
    if (error || !data) throw new Error(error?.message ?? 'El repuesto no existe o no tienes permiso para actualizarlo.');
    const saved = mapInventoryRow(data);
    fetchVersion.current++;
    setInventory((previous) => previous.map((item) => item.id === saved.id ? saved : item));
    void fetchData(true);
    return saved;
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
    return <LoginView onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="flex h-dvh w-full bg-[#0c0c0e] text-zinc-100 overflow-hidden font-sans select-text">
      <Sidebar administrator={shiftRole==='administrador'}
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
        <Header warrantyNotifications={orders.filter(o=>o.parentOrderId&&o.estado==='Garantía').map(o=>({id:o.id,technician:o.tecnico?.nombre||'Por asignar'}))} onOpenWarranty={id=>setSelectedOrderForDrawer(orders.find(o=>o.id===id)||null)} shiftRole={shiftRole} onShiftRoleChange={role=>{setShiftRole(role);setActiveTab('dashboard');setViewMode(role==='tecnico'?'taller':'recepcion');}}
          globalSearch={globalSearch}
          setGlobalSearch={setGlobalSearch}
          onOpenNewOrder={openNewOrder}
          viewMode={viewMode}
          onViewModeChange={changeViewMode}
          urgentOrdersCount={urgentOrdersCount}
          onLogout={() => setIsAuthenticated(false)}
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
          {globalSearch.trim() && shiftRole!=='tecnico' && displayedOrders.filter(o=>warrantyActive(o)&&!o.parentOrderId).slice(0,5).map(o=><button key={o.id} onClick={()=>setSelectedOrderForDrawer(o)} className="block p-3 rounded bg-purple-950 text-purple-200">{o.id} · Registrar Reingreso por Garantía</button>)}
          {activeTab === 'dashboard' && (viewMode === 'taller' || shiftRole === 'tecnico') && (
            <MobileWorkshopView
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
          {activeTab === 'dashboard' && viewMode === 'recepcion' && shiftRole !== 'tecnico' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {shiftRole==='administrador' && <MetricCards orders={orders} onSelectFilter={(st) => setTableStatusFilter(st)} />}
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
          {activeTab === 'inventario' && shiftRole!=='administrador' && <div className="grid gap-3">{inventory.map(item=><article key={item.id} className="p-4 bg-zinc-900 rounded-xl"><strong>{item.nombre}</strong><p>{item.sku} · Stock {item.stockActual}</p><p>Precio de venta: ${item.precioVenta}</p></article>)}</div>}
          {activeTab === 'caja' && shiftRole==='administrador' && <CashRegisterView width={config.anchoTicket}/>}
          {activeTab === 'inventario' && shiftRole==='administrador' && (
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
          {activeTab === 'reportes' && shiftRole==='administrador' && (
            <div className="animate-in fade-in duration-150">
              <ReportsView orders={orders} inventory={inventory} />
            </div>
          )}
          {activeTab === 'configuraciones' && shiftRole==='administrador' && (
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
      <DeviceDetailDrawer
        key={selectedOrderForDrawer?.id ?? 'closed'}
        order={liveDrawerOrder}
        isOpen={!!liveDrawerOrder}
        onClose={() => setSelectedOrderForDrawer(null)}
        onUpdateStatus={handleUpdateOrderStatus}
        autoWhatsApp={Boolean(config.whatsappAutoSend && config.whatsappApiUrl?.trim())}
        onAddNote={handleAddNoteToOrder}
        onPayment={shiftRole==='tecnico'?undefined:handlePayment}
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
