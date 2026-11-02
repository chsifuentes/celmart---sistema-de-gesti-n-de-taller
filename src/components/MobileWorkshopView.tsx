import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Camera,
  Check,
  CheckCheck,
  ClipboardList,
  FilePenLine,
  LoaderCircle,
  MessageCircle,
  Plus,
  Tag,
  Wrench,
} from 'lucide-react';
import type {
  Order,
  OrderStatus,
  TechNote,
  WhatsAppTemplateKey,
} from '../types';
import { uploadWorkshopPhoto } from '../lib/imageStorage';
import { determineTemplateKeyForStatus } from '../lib/whatsapp';
import { assignedTo, orderTiming } from '../lib/workbench';

export type WorkshopLane = 'cola' | 'mesa' | 'listos';
export type WorkshopFilter = 'all' | 'mine' | 'urgent';

export interface MobileWorkshopViewProps {
  selectedTechnician?: string;
  technicians?: { nombre: string }[];
  onTechnicianChange?: (name: string) => void;
  onSaveLocation?: (id: string, value: string) => Promise<void>;
  onPrintLabel?: (order: Order) => void;
  orders: Order[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onReceiveExpress: () => void;
  onSelectOrder: (order: Order) => void;
  onUpdateStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  onAddPhoto: (orderId: string, photoUrl: string) => Promise<void>;
  onAddNote: (
    orderId: string,
    content: string,
    type: TechNote['tipo']
  ) => Promise<void>;
  onOpenWhatsApp: (order: Order, templateKey?: WhatsAppTemplateKey) => void;
  onDeliveryReceipt?: (order: Order) => void;
  lastDeliveredOrder?: Order | null;
}

export function getWorkshopLane(status: OrderStatus): WorkshopLane | null {
  // Warranty reentries remain visible alongside the diagnostic queue.
  if (['Recibido', 'En Diagnóstico', 'Garantía'].includes(status))
    return 'cola';
  if (
    ['En Reparación', 'Esperando Repuesto', 'Esperando Presupuesto'].includes(
      status
    )
  )
    return 'mesa';
  return status === 'Listo' ? 'listos' : null;
}

const normalizeSearch = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim();

export function getVisibleWorkshopOrders(
  orders: Order[],
  filter: WorkshopFilter,
  technician: string
): Order[] {
  return orders.filter(
    (order) =>
      getWorkshopLane(order.estado) !== null &&
      (filter !== 'mine' || assignedTo(order, technician)) &&
      (filter !== 'urgent' || Boolean(order.prioridadUrgente))
  );
}

export function filterWorkshopOrders(
  orders: Order[],
  lane: WorkshopLane,
  search: string
): Order[] {
  const term = normalizeSearch(search);
  return orders
    .filter(
      (order) =>
        getWorkshopLane(order.estado) === lane &&
        (!term ||
          normalizeSearch(
            [
              order.id,
              order.cliente.nombre,
              order.cliente.telefono,
              order.dispositivo.marca,
              order.dispositivo.modelo,
              order.dispositivo.imei,
              order.dispositivo.categoria,
              order.tecnico?.nombre,
              order.fallaDeclarada,
              order.estado,
              order.ubicacionFisica,
            ]
              .filter(Boolean)
              .join(' ')
          ).includes(term))
    )
    .sort(
      (a, b) =>
        Number(Boolean(b.prioridadUrgente)) -
        Number(Boolean(a.prioridadUrgente))
    );
}

type StatusAction = { status: OrderStatus; label: string };
export function getWorkshopActions(status: OrderStatus): StatusAction[] {
  switch (status) {
    case 'Recibido':
      return [{ status: 'En Diagnóstico', label: 'Iniciar diagnóstico' }];
    case 'En Diagnóstico':
      return [
        { status: 'Esperando Presupuesto', label: 'Pasar a presupuesto' },
        { status: 'En Reparación', label: 'Pasar a reparación' },
      ];
    case 'Esperando Presupuesto':
      return [
        { status: 'En Reparación', label: 'Aprobado · reparar' },
        { status: 'Esperando Repuesto', label: 'Aprobado · pedir repuesto' },
      ];
    case 'Garantía':
      return [{ status: 'En Diagnóstico', label: 'Revisar garantía' }];
    case 'Esperando Repuesto':
      return [
        { status: 'En Reparación', label: 'Llegó el repuesto · reparar' },
      ];
    case 'En Reparación':
      return [
        { status: 'Listo', label: 'Marcar listo para entregar' },
        { status: 'Esperando Repuesto', label: 'Esperando repuesto' },
      ];
    case 'Listo':
      return [{ status: 'Entregado', label: 'Marcar entregado' }];
    default:
      return [];
  }
}

export function getOrderUnlock(order: Order): {
  label: string;
  value: string;
  points: number[];
} {
  const key = order.dispositivo.claveBloqueo?.trim() || '';
  const savedPoints = order.dispositivo.patronPuntos || [];
  const parsedPoints = /^patr[oó]n\b/i.test(key)
    ? (key.match(/\d+/g) || []).map(Number)
    : [];
  const points = (savedPoints.length ? savedPoints : parsedPoints).filter(
    (point) => Number.isInteger(point) && point >= 1 && point <= 9
  );
  if (points.length)
    return { label: 'Patrón', value: points.join(' → '), points };
  if (
    order.dispositivo.tipoBloqueo === 'Ninguno' ||
    /^sin (contraseña|clave|bloqueo)$/i.test(key)
  )
    return { label: 'Acceso', value: 'Sin bloqueo', points: [] };
  return {
    label:
      order.dispositivo.tipoBloqueo === 'Patrón' ? 'Patrón' : 'PIN / clave',
    value: key || 'Sin registrar',
    points: [],
  };
}

const ADVANCE_LABEL: Partial<Record<OrderStatus, string>> = {
  'En Diagnóstico': 'Diagnóstico',
  'Esperando Presupuesto': 'Presupuesto',
  'En Reparación': 'Reparar',
  'Esperando Repuesto': 'Esperar pieza',
  Listo: 'Marcar listo',
  Entregado: 'Entregar',
};
const secondary =
  'inline-flex h-8 lg:h-7 items-center gap-1 rounded-md border border-zinc-800/80 bg-[#1c1c20] px-2 text-[11px] text-zinc-400 hover:border-zinc-700 hover:text-zinc-100 disabled:opacity-40';

type OrderCardProps = Pick<
  MobileWorkshopViewProps,
  | 'onSelectOrder'
  | 'onUpdateStatus'
  | 'onAddPhoto'
  | 'onAddNote'
  | 'onOpenWhatsApp'
  | 'onSaveLocation'
  | 'onPrintLabel'
> & { now: Date; order: Order };

// Stable card identity preserves camera inputs and drafts through filter/tab changes.
function WorkshopOrderCard({
  now,
  order,
  onSelectOrder,
  onUpdateStatus,
  onAddPhoto,
  onAddNote,
  onOpenWhatsApp,
  onSaveLocation,
  onPrintLabel,
}: OrderCardProps) {
  const [pending, setPending] = useState<
    'photo' | 'note' | 'status' | 'location' | null
  >(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [editingLocation, setEditingLocation] = useState(false);
  const [location, setLocation] = useState(order.ubicacionFisica || '');
  const cameraInput = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const unlock = getOrderUnlock(order);
  const actions = getWorkshopActions(order.estado);
  const advance = actions[0];
  const photos = order.fotosEvidencia || [];
  const timing = orderTiming(order, now);
  const age = timing.label
    .replace(/^Ingresó hace /, 'hace ')
    .replace('menos de 1h', '<1h')
    .replace(/(\d+) días?/, '$1d')
    .replace('Ingreso sin fecha verificable', 'Sin fecha');
  const warranty = Boolean(order.parentOrderId || order.estado === 'Garantía');

  useEffect(() => {
    if (!editingLocation) setLocation(order.ubicacionFisica || '');
  }, [order.ubicacionFisica, editingLocation]);

  const runAction = async (
    kind: NonNullable<typeof pending>,
    action: () => Promise<void>,
    message: string
  ) => {
    if (busy.current) return false;
    busy.current = true;
    setPending(kind);
    setError('');
    setFeedback('');
    try {
      await action();
      setFeedback(message);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'No se pudo guardar el cambio. Inténtalo de nuevo.'
      );
      return false;
    } finally {
      busy.current = false;
      setPending(null);
    }
  };
  const receivePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await runAction(
      'photo',
      async () => {
        const url = await uploadWorkshopPhoto(file, 'ordenes', order.id);
        if (!url)
          throw new Error('No se pudo preparar la foto. Vuelve a intentarlo.');
        await onAddPhoto(order.id, url);
      },
      'Foto guardada.'
    );
  };
  const saveNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!noteDraft.trim()) return;
    if (
      await runAction(
        'note',
        () => onAddNote(order.id, noteDraft.trim(), 'reparacion'),
        'Nota guardada.'
      )
    ) {
      setNoteDraft('');
      setShowNote(false);
    }
  };
  const saveLocation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!onSaveLocation || !location.trim()) return;
    if (
      await runAction(
        'location',
        () => onSaveLocation(order.id, location.trim()),
        'Ubicación guardada.'
      )
    )
      setEditingLocation(false);
  };
  const bodyClick = (event: React.MouseEvent<HTMLElement>) => {
    if (
      (event.target as Element).closest('button,input,textarea,select,a,form')
    )
      return;
    onSelectOrder(order);
  };

  return (
    <article
      aria-label={`Orden ${order.id}`}
      onClick={bodyClick}
      className="min-w-0 rounded-lg border border-zinc-800/80 bg-[#161619] p-3 transition-colors hover:border-zinc-700"
    >
      <button
        type="button"
        aria-label={`Abrir expediente ${order.id}`}
        onClick={() => onSelectOrder(order)}
        className="block w-full min-w-0 text-left rounded-sm focus-visible:outline focus-visible:outline-1 focus-visible:outline-zinc-500"
      >
        <span className="flex items-center gap-1.5 min-w-0">
          {order.prioridadUrgente && (
            <span
              aria-label="Urgente"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500"
            />
          )}
          <span className="font-mono text-[10px] text-zinc-200 shrink-0">
            {order.id}
          </span>
          <span
            title={order.dispositivo.categoria || 'Smartphone'}
            className="max-w-[100px] truncate rounded border border-zinc-800/80 bg-[#111114] px-1 py-0.5 text-[9px] text-zinc-500"
          >
            {order.dispositivo.categoria || 'Smartphone'}
          </span>
          <span
            title={
              timing.stale
                ? 'Más de 48 h sin cambio de estado'
                : timing.statusUnknown
                  ? 'Estado sin fecha verificable'
                  : timing.label
            }
            className={`ml-auto shrink-0 font-mono text-[10px] ${timing.stale ? 'text-amber-400' : 'text-zinc-500'}`}
          >
            {timing.stale ? '⚠ ' : ''}
            {age}
          </span>
        </span>
        <span className="mt-2 flex items-baseline gap-2 min-w-0">
          <span
            title={`${order.dispositivo.marca} ${order.dispositivo.modelo}`}
            className="min-w-0 truncate font-semibold text-xs text-zinc-100"
          >
            {order.dispositivo.marca}{' '}
            {order.dispositivo.modelo || 'Equipo sin modelo'}
          </span>
          <span
            title={order.cliente.nombre}
            className="ml-auto max-w-[42%] truncate text-[11px] text-zinc-500"
          >
            {order.cliente.nombre}
          </span>
        </span>
      </button>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 font-mono text-[10px]">
        <span
          title={`${unlock.label}: ${unlock.value}`}
          className="max-w-full truncate rounded-md border border-zinc-800/80 bg-[#111114] px-1.5 py-1 text-zinc-300 select-all"
        >
          🔑 PIN/Patrón: {unlock.value}
        </span>
        {editingLocation ? (
          <form
            onSubmit={saveLocation}
            className="inline-flex min-w-0 max-w-full gap-1"
          >
            <input
              autoFocus
              aria-label={`Ubicación física ${order.id}`}
              placeholder="Gaveta B-04"
              value={location}
              maxLength={120}
              required
              disabled={pending !== null}
              onChange={(event) => setLocation(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setEditingLocation(false);
                  setLocation(order.ubicacionFisica || '');
                }
              }}
              className="min-w-0 w-28 rounded-md border border-zinc-700 bg-[#1c1c20] px-1.5 py-1 text-[10px] text-zinc-200 outline-none"
            />
            <button
              type="submit"
              aria-label={`Guardar ubicación ${order.id}`}
              disabled={pending !== null || !location.trim()}
              className="rounded-md border border-zinc-800/80 bg-[#1c1c20] px-1.5 text-zinc-300 hover:border-zinc-700 disabled:opacity-40"
            >
              <Check className="h-3 w-3" />
            </button>
          </form>
        ) : (
          <button
            type="button"
            title="Asignar ubicación física"
            aria-label={`Editar ubicación ${order.id}`}
            disabled={!onSaveLocation || pending !== null}
            onClick={() => setEditingLocation(true)}
            className="max-w-full truncate rounded-md border border-zinc-800/80 bg-[#1c1c20] px-1.5 py-1 text-zinc-400 hover:border-zinc-700 disabled:opacity-50"
          >
            📍 Ubicación: {order.ubicacionFisica || 'Sin asignar'}
          </button>
        )}
        {warranty && (
          <span className="rounded border border-purple-900/60 px-1 py-0.5 text-[9px] text-purple-300">
            Garantía Activa
          </span>
        )}
      </div>
      <p
        title={order.fallaDeclarada}
        className="mt-2 truncate text-[11px] text-zinc-500"
      >
        {order.fallaDeclarada || 'Revisar falla con recepción.'}
      </p>
      <div className="mt-2 flex min-w-0 items-center justify-between gap-2 border-t border-zinc-800/80 pt-2">
        <span className="min-w-0 truncate text-[10px] text-zinc-500">
          {order.estado} · {order.tecnico?.nombre || 'Sin técnico'}
        </span>
        {photos.length > 0 && (
          <button
            type="button"
            onClick={() => onSelectOrder(order)}
            aria-label={`Ver ${photos.length} fotos en el expediente ${order.id}`}
            className="flex shrink-0 items-center gap-1"
          >
            {photos.slice(0, 3).map((url, index) => (
              <img
                key={`${index}-${url}`}
                src={url}
                alt={`Evidencia ${index + 1}`}
                loading="lazy"
                className="h-6 w-6 rounded-md border border-zinc-800/80 object-cover"
              />
            ))}
            {photos.length > 3 && (
              <span className="text-[10px] font-mono text-zinc-500">
                +{photos.length - 3}
              </span>
            )}
          </button>
        )}
      </div>
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={receivePhoto}
        disabled={pending !== null}
        className="hidden"
        aria-label={`Tomar foto para ${order.id}`}
      />
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => cameraInput.current?.click()}
          disabled={pending !== null}
          className={secondary}
        >
          {pending === 'photo' ? (
            <LoaderCircle className="h-3 w-3 animate-spin" />
          ) : (
            <Camera className="h-3 w-3" />
          )}
          +Foto
        </button>
        {onPrintLabel && (
          <button
            type="button"
            onClick={() => onPrintLabel(order)}
            className={secondary}
            title="Imprimir etiqueta de equipo"
          >
            <Tag className="h-3 w-3" />
            Etiqueta
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            onOpenWhatsApp(order, determineTemplateKeyForStatus(order.estado))
          }
          disabled={pending !== null}
          aria-label={`WhatsApp al cliente de ${order.id}`}
          className={secondary}
        >
          <MessageCircle className="h-3 w-3" />
          WA
        </button>
        <button
          type="button"
          onClick={() => setShowNote((current) => !current)}
          disabled={pending !== null}
          aria-label={`Nota técnica ${order.id}`}
          aria-expanded={showNote}
          title="Nota técnica rápida"
          className={secondary}
        >
          <FilePenLine className="h-3 w-3" />
        </button>
        {advance && (
          <button
            type="button"
            aria-label={advance.label}
            title={advance.label}
            onClick={() => {
              void runAction(
                'status',
                () => onUpdateStatus(order.id, advance.status),
                `Estado: ${advance.status}`
              );
            }}
            disabled={pending !== null}
            className="ml-auto inline-flex h-8 items-center gap-1 rounded-md bg-zinc-100 px-3.5 py-2 text-xs font-semibold text-zinc-950 hover:bg-white disabled:opacity-40"
          >
            {pending === 'status' ? (
              <LoaderCircle className="h-3 w-3 animate-spin" />
            ) : (
              <ArrowRight className="h-3 w-3" />
            )}
            {ADVANCE_LABEL[advance.status] || advance.label}
          </button>
        )}
      </div>
      {showNote && (
        <form onSubmit={saveNote} className="mt-2 space-y-2">
          <textarea
            aria-label={`Nota de reparación ${order.id}`}
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            disabled={pending !== null}
            rows={2}
            placeholder="Medición, diagnóstico o siguiente paso…"
            className="block w-full rounded-md border border-zinc-800/80 bg-[#1c1c20] px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-zinc-700"
          />
          <button
            type="submit"
            disabled={pending !== null || !noteDraft.trim()}
            className="rounded-md bg-zinc-100 px-3.5 py-2 text-xs font-semibold text-zinc-950 disabled:opacity-40"
          >
            Guardar nota
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[11px] text-rose-300">
          {error}
        </p>
      )}
      {feedback && (
        <p role="status" className="mt-2 text-[10px] text-zinc-500">
          {feedback}
        </p>
      )}
    </article>
  );
}

const LANES = [
  {
    id: 'cola' as const,
    label: 'Por Diagnosticar',
    icon: ClipboardList,
    empty: 'Sin equipos por diagnosticar.',
  },
  {
    id: 'mesa' as const,
    label: 'En Mesa / Espera',
    icon: Wrench,
    empty: 'Sin equipos en mesa o espera.',
  },
  {
    id: 'listos' as const,
    label: 'Listos para Entrega',
    icon: CheckCheck,
    empty: 'Sin equipos listos para entrega.',
  },
];

export function MobileWorkshopView({
  selectedTechnician = '',
  technicians = [],
  onTechnicianChange,
  orders,
  searchQuery,
  onSearchChange,
  onReceiveExpress,
  lastDeliveredOrder,
  onDeliveryReceipt,
  ...cardActions
}: MobileWorkshopViewProps) {
  const [filter, setFilter] = useState<WorkshopFilter>('all');
  const [activeLane, setActiveLane] = useState<WorkshopLane>('cola');
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const filtered = getVisibleWorkshopOrders(orders, filter, selectedTechnician);
  const lanes = LANES.map((lane) => ({
    ...lane,
    visible: filterWorkshopOrders(filtered, lane.id, searchQuery),
  }));
  const names =
    technicians.some((tech) => tech.nombre === selectedTechnician) ||
    !selectedTechnician
      ? technicians
      : [...technicians, { nombre: selectedTechnician }];
  const deliveredDate =
    lastDeliveredOrder?.fechaEntrega &&
    Number.isFinite(Date.parse(lastDeliveredOrder.fechaEntrega))
      ? lastDeliveredOrder.fechaEntrega
      : null;

  return (
    <div className="w-full min-w-0 p-3 sm:p-4 space-y-3 text-xs">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 lg:flex-nowrap">
        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:flex-nowrap">
          <h1
            title="Laboratorio & Mesa de Trabajo"
            className="shrink-0 text-xs font-semibold text-zinc-100 lg:max-w-[160px] lg:truncate xl:max-w-none"
          >
            Laboratorio &amp; Mesa de Trabajo
          </h1>
          <div
            role="group"
            aria-label="Filtros de laboratorio"
            className="inline-flex shrink-0 items-center gap-1"
          >
            {(
              [
                { id: 'all', label: 'Todos los activos' },
                { id: 'mine', label: 'Mis asignados' },
                { id: 'urgent', label: '🔥 Urgentes' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
                className={`whitespace-nowrap rounded-md border px-2 py-1.5 text-[10px] transition-colors ${filter === item.id ? 'border-zinc-700 bg-[#1c1c20] text-zinc-100' : 'border-zinc-800/80 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <select
            aria-label="Técnico activo del laboratorio"
            value={selectedTechnician}
            disabled={!onTechnicianChange}
            onChange={(event) => onTechnicianChange?.(event.target.value)}
            className="h-8 w-32 min-w-0 rounded-md border border-zinc-800/80 bg-[#1c1c20] px-2 text-[11px] text-zinc-400 outline-none focus:border-zinc-700 xl:w-40"
          >
            <option value="">Técnico activo</option>
            {names.map((tech) => (
              <option key={tech.nombre} value={tech.nombre}>
                {tech.nombre}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onReceiveExpress}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-zinc-100 px-3.5 py-2 text-xs font-semibold text-zinc-950 hover:bg-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Recepción Rápida
          </button>
        </div>
      </div>
      {filter === 'mine' && !selectedTechnician && (
        <p role="status" className="text-[11px] text-zinc-500">
          Selecciona el técnico activo para ver sus equipos asignados.
        </p>
      )}
      <div
        role="tablist"
        aria-label="Columnas del laboratorio"
        className="grid grid-cols-3 gap-1 rounded-md border border-zinc-800/80 bg-[#111114] p-1 lg:hidden"
      >
        {lanes.map((lane) => (
          <button
            key={lane.id}
            type="button"
            role="tab"
            id={`lab-tab-${lane.id}`}
            aria-controls={`lab-lane-${lane.id}`}
            aria-selected={activeLane === lane.id}
            tabIndex={activeLane === lane.id ? 0 : -1}
            onKeyDown={(event) => {
              const index = LANES.findIndex((item) => item.id === lane.id);
              const nextIndex =
                event.key === 'ArrowRight'
                  ? (index + 1) % LANES.length
                  : event.key === 'ArrowLeft'
                    ? (index + LANES.length - 1) % LANES.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? LANES.length - 1
                        : null;
              if (nextIndex === null) return;
              event.preventDefault();
              const next = LANES[nextIndex].id;
              setActiveLane(next);
              document.getElementById(`lab-tab-${next}`)?.focus();
            }}
            onClick={() => setActiveLane(lane.id)}
            className={`min-w-0 rounded px-1 py-2 text-[10px] ${activeLane === lane.id ? 'bg-[#1c1c20] text-zinc-100' : 'text-zinc-500'}`}
          >
            <span className="block truncate">{lane.label}</span>
            <span className="font-mono">{lane.visible.length}</span>
          </button>
        ))}
      </div>
      {lastDeliveredOrder?.estado === 'Entregado' && (
        <section
          aria-label="Comprobante de la última entrega"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-800/80 bg-[#161619] px-3 py-2 text-[11px] text-zinc-400"
        >
          <p>
            <span className="font-mono text-zinc-200">
              {lastDeliveredOrder.id}
            </span>{' '}
            · Entregado{' '}
            {deliveredDate ? (
              <time dateTime={deliveredDate} className="font-mono">
                {new Date(deliveredDate).toLocaleString('es-MX', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </time>
            ) : (
              '· Fecha sin registrar'
            )}{' '}
            · {lastDeliveredOrder.garantiaDias} días de garantía
          </p>
          {onDeliveryReceipt && (
            <button
              type="button"
              onClick={() => onDeliveryReceipt(lastDeliveredOrder)}
              className={secondary}
            >
              <MessageCircle className="h-3 w-3" />
              Enviar comprobante y garantía
            </button>
          )}
        </section>
      )}
      <div
        aria-label="Tablero Kanban de laboratorio"
        className="grid min-w-0 grid-cols-1 items-start gap-3 lg:grid-cols-3"
      >
        {lanes.map((lane) => {
          const visibleIds = new Set(lane.visible.map((order) => order.id));
          const laneOrders = orders
            .filter((order) => getWorkshopLane(order.estado) === lane.id)
            .sort(
              (a, b) =>
                Number(Boolean(b.prioridadUrgente)) -
                Number(Boolean(a.prioridadUrgente))
            );
          return (
            <section
              key={lane.id}
              id={`lab-lane-${lane.id}`}
              aria-label={lane.label}
              className={`min-w-0 rounded-lg border border-zinc-800/80 bg-[#111114] ${activeLane === lane.id ? 'block' : 'hidden lg:block'}`}
            >
              <div className="flex items-center gap-2 border-b border-zinc-800/80 px-3 py-2.5 text-[11px] text-zinc-400">
                <lane.icon className="h-3.5 w-3.5" />
                <h2 className="font-semibold text-zinc-300">{lane.label}</h2>
                <span className="ml-auto rounded bg-[#1c1c20] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                  {lane.visible.length}
                </span>
              </div>
              <div className="space-y-2 p-2">
                {laneOrders.map((order) => (
                  <div key={order.id} hidden={!visibleIds.has(order.id)}>
                    <WorkshopOrderCard
                      now={now}
                      order={order}
                      {...cardActions}
                    />
                  </div>
                ))}
                {!lane.visible.length && (
                  <p className="px-1 py-4 text-[11px] text-zinc-600">
                    {searchQuery.trim()
                      ? 'No encontramos equipos con esa búsqueda.'
                      : lane.empty}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {searchQuery.trim() && !lanes.some((lane) => lane.visible.length) && (
        <button
          type="button"
          onClick={() => onSearchChange('')}
          className="text-[11px] text-zinc-400 hover:text-zinc-100"
        >
          Limpiar búsqueda
        </button>
      )}
    </div>
  );
}
