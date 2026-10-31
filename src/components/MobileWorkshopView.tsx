import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Camera, CheckCheck, ClipboardList, FilePenLine, Inbox, LoaderCircle, LockKeyhole, MessageCircle, Wrench } from 'lucide-react';
import type { Order, OrderStatus, TechNote, WhatsAppTemplateKey } from '../types';
import { uploadWorkshopPhoto } from '../lib/imageStorage';
import { determineTemplateKeyForStatus } from '../lib/whatsapp';

import {assignedTo,orderTiming} from '../lib/workbench';
import {LocationControl} from './LocationControl';
export type WorkshopLane = 'cola' | 'mesa' | 'listos';

export interface MobileWorkshopViewProps {
  selectedTechnician?: string;
  technicians?: { nombre: string }[];
  onTechnicianChange?: (name: string) => void;
  onSaveLocation?: (id:string,value:string)=>Promise<void>;
  onPrintLabel?: (order:Order)=>void;
  orders: Order[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onReceiveExpress: () => void;
  onSelectOrder: (order: Order) => void;
  onUpdateStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  onAddPhoto: (orderId: string, photoUrl: string) => Promise<void>;
  onAddNote: (orderId: string, content: string, type: TechNote['tipo']) => Promise<void>;
  onOpenWhatsApp: (order: Order, templateKey?: WhatsAppTemplateKey) => void;
  onDeliveryReceipt?: (order: Order) => void;
  lastDeliveredOrder?: Order | null;
}

export function getWorkshopLane(status: OrderStatus): WorkshopLane | null {
  if (['Recibido', 'En Diagnóstico', 'Esperando Presupuesto', 'Garantía'].includes(status)) return 'cola';
  if (['En Reparación', 'Esperando Repuesto'].includes(status)) return 'mesa';
  return status === 'Listo' ? 'listos' : null;
}

const normalizeSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();

export function filterWorkshopOrders(orders: Order[], lane: WorkshopLane, search: string): Order[] {
  const term = normalizeSearch(search);
  return orders.filter((order) => {
    if (getWorkshopLane(order.estado) !== lane) return false;
    if (!term) return true;
    return normalizeSearch([
      order.id, order.cliente.nombre, order.cliente.telefono, order.dispositivo.marca,
      order.dispositivo.modelo, order.dispositivo.imei, order.dispositivo.categoria,
      order.tecnico?.nombre, order.fallaDeclarada, order.estado,
    ].filter(Boolean).join(' ')).includes(term);
  }).sort((a, b) => Number(Boolean(b.prioridadUrgente)) - Number(Boolean(a.prioridadUrgente)));
}

type StatusAction = { status: OrderStatus; label: string };

export function getWorkshopActions(status: OrderStatus): StatusAction[] {
  switch (status) {
    case 'Recibido': return [{ status: 'En Diagnóstico', label: 'Iniciar diagnóstico' }];
    case 'En Diagnóstico': return [
      { status: 'Esperando Presupuesto', label: 'Pasar a presupuesto' },
      { status: 'En Reparación', label: 'Pasar a reparación' },
    ];
    case 'Esperando Presupuesto': return [
      { status: 'En Reparación', label: 'Aprobado · reparar' },
      { status: 'Esperando Repuesto', label: 'Aprobado · pedir repuesto' },
    ];
    case 'Garantía': return [{ status: 'En Diagnóstico', label: 'Revisar garantía' }];
    case 'Esperando Repuesto': return [{ status: 'En Reparación', label: 'Llegó el repuesto · reparar' }];
    case 'En Reparación': return [
      { status: 'Listo', label: 'Marcar listo para entregar' },
      { status: 'Esperando Repuesto', label: 'Esperando repuesto' },
    ];
    case 'Listo': return [{ status: 'Entregado', label: 'Marcar entregado' }];
    default: return [];
  }
}

export function getOrderUnlock(order: Order): { label: string; value: string; points: number[] } {
  const key = order.dispositivo.claveBloqueo?.trim() || '';
  const savedPoints = order.dispositivo.patronPuntos || [];
  const parsedPoints = /^patr[oó]n\b/i.test(key) ? (key.match(/\d+/g) || []).map(Number) : [];
  const points = (savedPoints.length ? savedPoints : parsedPoints).filter((point) => Number.isInteger(point) && point >= 1 && point <= 9);
  if (points.length) return { label: 'Patrón', value: points.join(' → '), points };
  if (order.dispositivo.tipoBloqueo === 'Ninguno' || /^sin (contraseña|clave|bloqueo)$/i.test(key)) {
    return { label: 'Acceso', value: 'Sin bloqueo', points: [] };
  }
  return { label: order.dispositivo.tipoBloqueo === 'Patrón' ? 'Patrón' : 'PIN / clave', value: key || 'Sin registrar', points: [] };
}

function UnlockPattern({ points }: { points: number[] }) {
  const coordinates = (point: number) => `${16 + ((point - 1) % 3) * 28},${16 + Math.floor((point - 1) / 3) * 28}`;
  return (
    <svg viewBox="0 0 88 88" className="w-[88px] h-[88px] shrink-0" role="img" aria-label={`Patrón: ${points.join(', ')}`}>
      <polyline points={points.map(coordinates).join(' ')} fill="none" stroke="#2dd4bf" strokeWidth="3" strokeLinejoin="round" />
      {Array.from({ length: 9 }, (_, index) => {
        const point = index + 1;
        const x = 16 + (index % 3) * 28;
        const y = 16 + Math.floor(index / 3) * 28;
        const selected = points.includes(point);
        return (
          <g key={point}>
            <circle cx={x} cy={y} r="10" fill={selected ? '#134e4a' : '#27272a'} stroke={selected ? '#2dd4bf' : '#52525b'} />
            <text x={x} y={y + 3.5} textAnchor="middle" fill={selected ? '#ccfbf1' : '#a1a1aa'} fontSize="10">{point}</text>
          </g>
        );
      })}
    </svg>
  );
}

type OrderCardProps = Pick<MobileWorkshopViewProps, 'onSelectOrder' | 'onUpdateStatus' | 'onAddPhoto' | 'onAddNote' | 'onOpenWhatsApp' | 'onSaveLocation' | 'onPrintLabel'> & {
  now: Date;
  order: Order;
  onStatusChanged: (message: string) => void;
};

// Defined outside the view so live order updates preserve open notes and camera state.
function WorkshopOrderCard({ now,onSaveLocation,onPrintLabel,order, onSelectOrder, onUpdateStatus, onAddPhoto, onAddNote, onOpenWhatsApp, onStatusChanged }: OrderCardProps) {
  const [pending, setPending] = useState<'photo' | 'note' | 'status' | null>(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const cameraInput = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const unlock = getOrderUnlock(order);
  const actions = getWorkshopActions(order.estado);
  const photos = order.fotosEvidencia || [];
  const isReady = order.estado === 'Listo';
  const timing=orderTiming(order,now);

  const runAction = async (kind: 'photo' | 'note' | 'status', action: () => Promise<void>, successMessage: string) => {
    if (busy.current) return false;
    busy.current = true;
    setPending(kind);
    setError('');
    setFeedback('');
    try {
      await action();
      setFeedback(successMessage);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el cambio. Inténtalo de nuevo.');
      return false;
    } finally {
      busy.current = false;
      setPending(null);
    }
  };

  const receivePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] as File | undefined;
    event.target.value = '';
    if (!file) return;
    await runAction('photo', async () => {
      const url = await uploadWorkshopPhoto(file, 'ordenes', order.id);
      if (!url) throw new Error('No se pudo subir la foto. Revisa la conexión y vuelve a tomarla.');
      await onAddPhoto(order.id, url);
    }, 'Foto guardada en el expediente.');
  };

  const saveNote = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = noteDraft.trim();
    if (!text) return;
    const saved = await runAction('note', () => onAddNote(order.id, text, 'reparacion'), 'Nota guardada.');
    if (saved) {
      setNoteDraft('');
      setShowNote(false);
    }
  };

  const advance = async (status: OrderStatus) => {
    const saved = await runAction('status', () => onUpdateStatus(order.id, status), `Estado: ${status}`);
    if (saved) onStatusChanged(`${order.id} · ${status}`);
  };

  return (
    <article className={`min-w-0 rounded-lg border bg-[#161619] overflow-hidden ${order.prioridadUrgente ? 'border-amber-500/70' : isReady ? 'border-emerald-700/60' : 'border-zinc-800/80'}`} aria-label={`Orden ${order.id}`}>
      <div className={`px-4 py-2.5 flex flex-wrap justify-between gap-2 text-xs font-semibold ${isReady ? 'bg-emerald-950/40 text-emerald-300' : 'bg-[#111114] text-zinc-400'}`}>
        <span className="font-mono text-sm text-zinc-100">{order.id}</span>
        <span>{order.prioridadUrgente ? '⚡ URGENTE · ' : ''}{order.estado}</span>
      </div>

      <div className="p-4 space-y-4">
        <button type="button" onClick={() => onSelectOrder(order)} className="w-full min-h-12 text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400" aria-label={`Abrir expediente ${order.id}`}>
          <span className="block text-[11px] text-zinc-400 uppercase tracking-wider">{order.dispositivo.categoria || 'Smartphone'} · {order.dispositivo.marca}</span>
          <span className="mt-1 block text-sm leading-tight font-bold text-zinc-100 break-words">{order.dispositivo.modelo || 'Equipo sin modelo'}</span>
          <span className="mt-1 block text-sm text-zinc-400">{order.cliente.nombre}</span>
        </button>

        {(order.parentOrderId || order.estado==='Garantía') && <span className="inline-block bg-purple-900 text-purple-200 px-3 py-1 rounded-full text-xs">Garantía Activa · {order.parentOrderId || order.id}</span>}
        <p className={timing.stale?'text-amber-300 font-semibold':'text-xs text-zinc-400'}>{timing.label}{timing.stale?' · ⚠ Más de 48 h sin cambio de estado':''}{timing.statusUnknown?' · Estado sin fecha verificable':''}</p>
        {onSaveLocation&&<LocationControl order={order} onSave={onSaveLocation}/>}
        {onPrintLabel&&<button type="button" onClick={()=>onPrintLabel(order)} className="min-h-9 w-full border border-zinc-800/80 bg-[#1c1c20] rounded-md px-2 text-xs text-zinc-400">🏷️ Imprimir Etiqueta de Equipo</button>}
        <p className="text-xs leading-relaxed text-zinc-200 break-words">{order.fallaDeclarada || 'Revisar falla con recepción.'}</p>

        <div className="rounded-md bg-[#111114] border border-zinc-800/80 p-2.5 flex items-center gap-3">
          {unlock.points.length ? <UnlockPattern points={unlock.points} /> : <LockKeyhole className="w-5 h-5 shrink-0 text-teal-400" />}
          <div className="min-w-0">
            <span className="block text-xs text-zinc-400">{unlock.label}</span>
            <span className="block mt-1 font-mono font-semibold text-sm text-zinc-200 break-all select-all">{unlock.value}</span>
          </div>
        </div>

        {photos.length > 0 && (
          <button type="button" onClick={() => onSelectOrder(order)} className="w-full flex items-center gap-2 text-left min-h-14 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400" aria-label={`Ver ${photos.length} fotos en el expediente ${order.id}`}>
            {photos.slice(0, 3).map((url, index) => <img key={`${index}-${url}`} src={url} alt={`Evidencia ${index + 1}`} loading="lazy" className="w-14 h-14 object-cover rounded-lg border border-zinc-700" />)}
            <span className="text-xs text-zinc-400 ml-auto">{photos.length} foto{photos.length === 1 ? '' : 's'}<br />Ver expediente →</span>
          </button>
        )}

        <div className="flex justify-between gap-2 text-xs text-zinc-400">
          <span className="truncate">{order.tecnico?.nombre || 'Sin técnico asignado'}</span>
          <span className="shrink-0 font-mono">{order.ingreso}</span>
        </div>

        <input ref={cameraInput} type="file" accept="image/*" capture="environment" onChange={receivePhoto} disabled={pending !== null} className="hidden" aria-label={`Tomar foto para ${order.id}`} />
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => cameraInput.current?.click()} disabled={pending !== null} className="min-h-11 rounded-md border border-zinc-800/80 text-zinc-300 bg-[#1c1c20] active:bg-zinc-800 disabled:opacity-40 flex flex-col items-center justify-center gap-1.5 text-xs font-semibold">
            {pending === 'photo' ? <LoaderCircle className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />} + Foto
          </button>
          <button type="button" onClick={() => setShowNote((current) => !current)} disabled={pending !== null} aria-expanded={showNote} className="min-h-11 rounded-md border border-zinc-800/80 text-zinc-300 bg-[#1c1c20] active:bg-zinc-800 disabled:opacity-40 flex flex-col items-center justify-center gap-1.5 text-xs font-semibold">
            <FilePenLine className="w-5 h-5" /> + Nota rápida
          </button>
          <button type="button" onClick={() => onOpenWhatsApp(order, determineTemplateKeyForStatus(order.estado))} disabled={pending !== null} aria-label={`WhatsApp al cliente de ${order.id}`} className="min-h-11 rounded-md border border-zinc-800/80 text-zinc-300 bg-[#1c1c20] active:bg-zinc-800 disabled:opacity-40 flex flex-col items-center justify-center gap-1.5 text-xs font-semibold">
            <MessageCircle className="w-5 h-5" /><span className="text-xs">WhatsApp</span>
          </button>
        </div>

        {showNote && (
          <form onSubmit={saveNote} className="space-y-2">
            <label className="text-xs text-zinc-400 block">
              Avance de reparación
              <textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} disabled={pending !== null} rows={3} placeholder="Medición, diagnóstico o siguiente paso…" className="mt-2 block w-full rounded-md border border-zinc-800/80 bg-[#1c1c20] p-3 text-xs text-zinc-100 focus:outline-none focus:border-teal-500 disabled:opacity-50" />
            </label>
            <button type="submit" disabled={pending !== null || !noteDraft.trim()} className="w-full min-h-11 rounded-md bg-zinc-100 text-zinc-950 font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
              {pending === 'note' && <LoaderCircle className="w-4 h-4 animate-spin" />}{pending === 'note' ? 'Guardando nota…' : 'Guardar nota'}
            </button>
          </form>
        )}

        {pending === 'photo' && <p role="status" className="text-xs text-teal-300">Comprimiendo y guardando foto…</p>}
        {error && <p role="alert" className="rounded-lg p-3 bg-rose-950/40 border border-rose-800/60 text-sm text-rose-200">{error}</p>}
        {feedback && <p role="status" className="text-xs text-teal-300">{feedback}</p>}

        <div className="space-y-2">
          {actions.map((action, index) => (
            <button key={action.status} type="button" onClick={() => { void advance(action.status); }} disabled={pending !== null} className={`w-full min-h-11 px-3 rounded-md flex items-center justify-center gap-2 text-xs font-semibold disabled:opacity-40 ${index === 0 ? 'bg-zinc-100 text-zinc-950 active:bg-white' : 'border border-zinc-800/80 bg-[#1c1c20] text-zinc-300 active:bg-zinc-800'}`}>
              {pending === 'status' ? <LoaderCircle className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
              {pending === 'status' ? 'Guardando estado…' : action.label}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

const LANES = [
  { id: 'cola' as const, label: 'En cola', icon: ClipboardList, empty: 'No hay equipos pendientes de revisar.' },
  { id: 'mesa' as const, label: 'En mesa', icon: Wrench, empty: 'No hay equipos en reparación o esperando repuesto.' },
  { id: 'listos' as const, label: 'Listos', icon: CheckCheck, empty: 'Los equipos listos para entregar aparecerán aquí.' },
];

export function MobileWorkshopView({ selectedTechnician='',technicians=[],onTechnicianChange,orders, searchQuery, onSearchChange, onReceiveExpress, lastDeliveredOrder, onDeliveryReceipt, ...cardActions }: MobileWorkshopViewProps) {
  const [mineOnly,setMineOnly]=useState(false);
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(timer);},[]);
  const assignedOrders=mineOnly?orders.filter(o=>assignedTo(o,selectedTechnician)):orders;
  const [activeLane, setActiveLane] = useState<WorkshopLane>('cola');
  const [statusNotice, setStatusNotice] = useState('');
  const lanes = LANES.map((lane) => ({ ...lane, orders: filterWorkshopOrders(assignedOrders, lane.id, searchQuery) }));
  const currentLane = lanes.find((lane) => lane.id === activeLane)!;
  const visibleIds = new Set(currentLane.orders.map((order) => order.id));
  const activeOrders = orders.filter((order) => getWorkshopLane(order.estado) !== null)
    .sort((a, b) => Number(Boolean(b.prioridadUrgente)) - Number(Boolean(a.prioridadUrgente)));

  return (
    <div className="w-full max-w-5xl mx-auto px-3 py-4 sm:px-5 space-y-4 pb-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-sm font-semibold text-zinc-100">Mesa de trabajo</h1>
          <p className="text-xs mt-1 text-zinc-400">La comanda del taller, siempre al día.</p>
        </div>
        <Wrench className="w-4 h-4 text-zinc-500 shrink-0" />
      </div>

      <button type="button" onClick={onReceiveExpress} className="w-full min-h-11 rounded-md bg-zinc-100 active:bg-white text-zinc-950 font-semibold flex items-center justify-center gap-3">
        <Camera className="w-6 h-6" /><span className="text-xs">Recibir Equipo Exprés</span><ArrowRight className="w-5 h-5" />
      </button>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={mineOnly} onClick={()=>setMineOnly(!mineOnly)} className={`h-9 rounded-md border px-3 text-xs ${mineOnly?'bg-[#1c1c20] border-zinc-600 text-zinc-100':'border-zinc-800/80 text-zinc-400'}`}>Mis Equipos Asignados {mineOnly?'✓':''}</button>
        {mineOnly&&onTechnicianChange&&<select aria-label="Técnico de mis equipos asignados" value={selectedTechnician} onChange={event=>onTechnicianChange(event.target.value)} className="h-9 max-w-full rounded-md border border-zinc-800/80 bg-[#1c1c20] px-2 text-xs text-zinc-300"><option value="">Seleccionar técnico</option>{technicians.map(technician=><option key={technician.nombre} value={technician.nombre}>{technician.nombre}</option>)}</select>}
      </div>
      {mineOnly&&!selectedTechnician&&<p role="status" className="text-xs text-zinc-500">Selecciona el técnico para ver sus equipos asignados.</p>}
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Colas de trabajo">
        {lanes.map(({ id, label, icon: Icon, orders: laneOrders }) => (
          <button key={id} type="button" onClick={() => setActiveLane(id)} aria-pressed={activeLane === id} className={`min-h-11 px-2 py-2 rounded-md flex flex-col items-center justify-center gap-1 text-xs font-medium border ${activeLane === id ? 'bg-zinc-100 text-zinc-950 border-zinc-100' : 'bg-[#161619] text-zinc-400 border-zinc-800/80 active:bg-zinc-800'}`}>
            <span className="flex gap-2 items-center"><Icon className="w-4 h-4" />{label}</span>
            <span className="font-mono text-xs">{laneOrders.length} equipo{laneOrders.length === 1 ? '' : 's'}</span>
          </button>
        ))}
      </div>

      {statusNotice && <p role="status" className="text-xs text-zinc-300 rounded-md bg-[#161619] border border-zinc-800/80 p-3">{statusNotice}</p>}

      {lastDeliveredOrder?.estado === 'Entregado' && (
        <section aria-label="Comprobante de la última entrega" className="rounded-lg border border-zinc-800/80 bg-[#161619] p-4 space-y-3">
          <p role="status" className="text-xs font-semibold text-zinc-200">{lastDeliveredOrder.id} · Equipo entregado</p>
          <p className="text-xs text-zinc-400">
            {lastDeliveredOrder.fechaEntrega && Number.isFinite(Date.parse(lastDeliveredOrder.fechaEntrega))
              ? <time dateTime={lastDeliveredOrder.fechaEntrega}>{new Date(lastDeliveredOrder.fechaEntrega).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</time>
              : 'Fecha de entrega no registrada'}
            {' · '}{lastDeliveredOrder.garantiaDias} días de garantía
          </p>
          {onDeliveryReceipt && <button type="button" onClick={() => onDeliveryReceipt(lastDeliveredOrder)} className="w-full min-h-11 rounded-md bg-zinc-100 text-zinc-950 font-semibold text-xs px-3 flex items-center justify-center gap-2"><MessageCircle className="h-5 w-5 shrink-0" />Enviar comprobante y garantía</button>}
        </section>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start" aria-label={`Equipos: ${currentLane.label.toLowerCase()}`}>
        {/* Hide cards instead of unmounting them: searches and lane changes must
            preserve note drafts, camera inputs and in-flight save guards/errors. */}
        {activeOrders.map((order) => (
          <div key={order.id} hidden={!visibleIds.has(order.id)} className="min-w-0">
            <WorkshopOrderCard now={now} order={order} {...cardActions} onStatusChanged={setStatusNotice} />
          </div>
        ))}
      </div>
      {currentLane.orders.length === 0 && (
        <div className="border border-dashed border-zinc-800/80 rounded-lg py-12 px-5 text-center space-y-3">
          <Inbox className="w-9 h-9 text-zinc-600 mx-auto" />
          <p className="text-zinc-300">{searchQuery.trim() ? 'No encontramos equipos con esa búsqueda en esta cola.' : currentLane.empty}</p>
          {searchQuery.trim() && <button type="button" onClick={() => onSearchChange('')} className="min-h-12 px-4 text-teal-300 font-semibold">Limpiar búsqueda</button>}
        </div>
      )}
    </div>
  );
}
