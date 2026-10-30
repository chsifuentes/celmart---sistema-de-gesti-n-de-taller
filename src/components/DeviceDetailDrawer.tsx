import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Printer,
  MessageSquare,
  Send,
  Camera,
  ImagePlus,
  LoaderCircle,
  CheckCircle2
} from 'lucide-react';
import { CHECKLIST_BY_CATEGORY, Order, OrderStatus, TechNote, InventoryItem, AssignedPart, WhatsAppTemplateKey } from '../types';
import { determineTemplateKeyForStatus } from '../lib/whatsapp';
import { uploadWorkshopPhoto } from '../lib/imageStorage';

function EvidencePreview({ url, onClose }: { url: string; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    closeButton.current?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Vista ampliada de evidencia fotográfica"
      className="fixed inset-0 z-[60] bg-black/95 p-4 flex items-center justify-center"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
        if (event.key === 'Tab') {
          event.preventDefault();
          closeButton.current?.focus();
        }
      }}
    >
      <button
        ref={closeButton}
        type="button"
        onClick={onClose}
        aria-label="Cerrar foto ampliada"
        className="absolute top-4 right-4 p-3 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-white"
      >
        <X className="w-5 h-5" />
      </button>
      <img
        src={url}
        alt="Evidencia del dispositivo en tamaño completo"
        className="max-w-full max-h-[90dvh] object-contain rounded-lg"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

interface DeviceDetailDrawerProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  autoWhatsApp?: boolean;
  onAddNote: (orderId: string, noteContent: string, noteType: TechNote['tipo']) => Promise<void>;
  onAssignPart: (orderId: string, part: AssignedPart) => Promise<void>;
  onAddPhoto: (orderId: string, photoUrl: string) => Promise<void>;
  onPrintTicket: (order: Order) => void;
  onOpenWhatsApp: (order: Order, templateKey?: WhatsAppTemplateKey) => void;
  onDeliveryReceipt?: (order: Order) => void;
  inventory: InventoryItem[];
}

export const DeviceDetailDrawer: React.FC<DeviceDetailDrawerProps> = ({
  order,
  isOpen,
  onClose,
  onUpdateStatus,
  autoWhatsApp = false,
  onAddNote,
  onAssignPart,
  onAddPhoto,
  onPrintTicket,
  onOpenWhatsApp,
  onDeliveryReceipt,
  inventory,
}) => {
  const [activeTab, setActiveTab] = useState<'expediente' | 'notas' | 'repuestos'>('expediente');
  const [newNote, setNewNote] = useState('');
  const [newNoteType, setNewNoteType] = useState<TechNote['tipo']>('diagnostico');
  const [selectedInventoryPartId, setSelectedInventoryPartId] = useState('');
  const [photoUpload, setPhotoUpload] = useState<{ orderId: string; busy: boolean; error?: string } | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{ orderId: string; url: string } | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadingPhotos = useRef(false);
  const [pendingAction, setPendingAction] = useState<'note' | 'part' | 'status' | null>(null);
  const [saveError, setSaveError] = useState<{ orderId: string; message: string } | null>(null);
  const savingAction = useRef(false);
  const currentOrderId = useRef(order?.id);

  useEffect(() => {
    currentOrderId.current = order?.id;
    setNewNote('');
    setSelectedInventoryPartId('');
    setPreviewPhoto(null);
    setActiveTab('expediente');
  }, [order?.id]);

  if (!isOpen || !order) return null;

  const totalPiezas = order.repuestosAsignados.reduce(
    (sum, p) => sum + p.precioUnitario * p.cantidad,
    0
  );
  const totalCobro = order.costoManoObra + totalPiezas;
  const category = order.dispositivo.categoria || 'Smartphone';
  const categoryChecklist = CHECKLIST_BY_CATEGORY[category] || CHECKLIST_BY_CATEGORY.Smartphone;
  // Keep saved legacy/custom checklist keys visible even if category templates evolve.
  const checklistItems = [
    ...categoryChecklist,
    ...Object.keys(order.checklist)
      .filter((key) => key !== 'equipoApagado' && !categoryChecklist.some((item) => item.key === key))
      .map((key) => ({ key, label: key })),
  ];

  const handlePhotoSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from<File>(event.target.files || []);
    event.target.value = '';
    if (!files.length || uploadingPhotos.current) return;

    const orderId = order.id;
    uploadingPhotos.current = true;
    setPhotoUpload({ orderId, busy: true });
    try {
      for (const file of files) {
        const photoUrl = await uploadWorkshopPhoto(file, 'ordenes', orderId);
        if (!photoUrl) throw new Error('No se pudo subir la foto. Comprueba la conexión y vuelve a intentarlo.');
        await onAddPhoto(orderId, photoUrl);
      }
      setPhotoUpload({ orderId, busy: false });
    } catch (error) {
      setPhotoUpload({
        orderId,
        busy: false,
        error: error instanceof Error ? error.message : 'No se pudo guardar la evidencia fotográfica.',
      });
    } finally {
      uploadingPhotos.current = false;
    }
  };

  const runOrderAction = async (action: 'note' | 'part' | 'status', save: () => Promise<void>) => {
    if (savingAction.current) return false;
    const orderId = order.id;
    savingAction.current = true;
    setPendingAction(action);
    setSaveError(null);
    try {
      await save();
      return true;
    } catch (error) {
      setSaveError({
        orderId,
        message: error instanceof Error ? error.message : 'No se pudieron guardar los cambios. Inténtalo de nuevo.',
      });
      return false;
    } finally {
      savingAction.current = false;
      setPendingAction(null);
    }
  };

  const handleAddNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    const submittedText = newNote;
    const saved = await runOrderAction('note', () => onAddNote(order.id, submittedText.trim(), newNoteType));
    if (saved && currentOrderId.current === order.id) {
      setNewNote((current) => current === submittedText ? '' : current);
    }
  };

  const handleAssignPartSubmit = async () => {
    if (!selectedInventoryPartId) return;
    const invItem = inventory.find((i) => i.id === selectedInventoryPartId);
    if (!invItem) return;

    const saved = await runOrderAction('part', () => onAssignPart(order.id, {
      id: `part-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      nombre: invItem.nombre,
      sku: invItem.sku,
      cantidad: 1,
      precioUnitario: invItem.precioVenta,
    }));
    if (saved && currentOrderId.current === order.id) setSelectedInventoryPartId('');
  };

  const handleStatusChange = async (newStatus: OrderStatus) => {
    if (newStatus === 'Entregado' && order.estado !== 'Listo' && order.estado !== 'Entregado') {
      setSaveError({ orderId: order.id, message: 'Marca el equipo como Listo antes de registrar su entrega.' });
      return;
    }
    const saved = await runOrderAction('status', () => onUpdateStatus(order.id, newStatus));
    if (saved && newStatus !== 'Entregado' && currentOrderId.current === order.id && !autoWhatsApp) {
      onOpenWhatsApp({ ...order, estado: newStatus }, determineTemplateKeyForStatus(newStatus));
    }
  };

  const statusOptions: OrderStatus[] = [
    'Recibido',
    'En Diagnóstico',
    'Esperando Presupuesto',
    'Esperando Repuesto',
    'En Reparación',
    'Listo',
    'Entregado',
    'Garantía',
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/75 backdrop-blur-xs flex justify-end">
      <div 
        className="w-full max-w-2xl bg-[#161619] border-l border-zinc-800/80 shadow-2xl h-full flex flex-col animate-in slide-in-from-right duration-200"
      >
        {/* Drawer Header */}
        <div className="p-4 border-b border-zinc-800/80 bg-[#111114] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#1c1c20] border border-zinc-700/80 flex items-center justify-center font-mono font-bold text-xs text-zinc-100">
              {order.id}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-zinc-100">
                  {order.dispositivo.modelo}
                </h2>
                {order.prioridadUrgente && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-950/50 text-rose-300 border border-rose-800/60 font-semibold">
                    URGENTE
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 font-mono">
                Cliente: <span className="text-zinc-200">{order.cliente.nombre}</span> · {order.cliente.telefono}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenWhatsApp(order, determineTemplateKeyForStatus(order.estado))}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-400 border border-emerald-800/50 text-xs font-medium flex items-center gap-1.5 transition-colors"
              title="Enviar WhatsApp al cliente"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">WhatsApp</span>
            </button>

            <button
              onClick={() => onPrintTicket(order)}
              className="p-1.5 rounded-lg bg-[#1c1c20] hover:bg-zinc-800 text-zinc-300 border border-zinc-700/60 transition-colors"
              title="Imprimir Ticket Térmico"
            >
              <Printer className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              disabled={pendingAction !== null || photoUpload?.busy === true}
              aria-label="Cerrar expediente"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-[#1c1c20] transition-colors disabled:opacity-40 disabled:cursor-wait"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status Quick Bar */}
        <div className="px-5 py-3 bg-[#111114] border-b border-zinc-800/80 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-400 font-mono text-[11px]">ESTADO ACTUAL:</span>
            <select
              value={order.estado}
              onChange={(e) => { void handleStatusChange(e.target.value as OrderStatus); }}
              disabled={pendingAction !== null}
              aria-label="Estado de la orden"
              className="bg-[#1c1c20] text-zinc-100 font-semibold px-3 py-1 rounded-lg border border-zinc-700/60 text-xs focus:outline-none focus:border-zinc-500 cursor-pointer"
            >
              {statusOptions.map((st) => (
                <option key={st} value={st} disabled={st === 'Entregado' && order.estado !== 'Listo' && order.estado !== 'Entregado'}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div className="text-right text-xs font-mono text-zinc-400">
            Ingreso: <span className="text-zinc-200">{order.ingreso}</span>
          </div>
        </div>

        {saveError?.orderId === order.id && (
          <p role="alert" className="px-5 py-3 text-xs text-rose-300 bg-rose-950/30 border-b border-rose-900/50">{saveError.message}</p>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-800/80 text-xs font-medium px-4 gap-2 bg-[#111114]">
          {[
            { id: 'expediente', label: 'Expediente & Ficha' },
            { id: 'notas', label: `Notas Técnicas (${order.notasTecnicas.length})` },
            { id: 'repuestos', label: `Costos & Repuestos (${order.repuestosAsignados.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 px-3 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-zinc-200 text-zinc-100 font-semibold'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Drawer Body Scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {order.estado === 'Entregado' && (
            <section aria-label="Comprobante de entrega" className="rounded-xl border border-emerald-800/60 bg-emerald-950/25 p-4 space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-300"><CheckCircle2 className="h-4 w-4" />Equipo entregado</h3>
              <p className="text-zinc-300">
                {order.fechaEntrega && Number.isFinite(Date.parse(order.fechaEntrega))
                  ? <time dateTime={order.fechaEntrega}>{new Date(order.fechaEntrega).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</time>
                  : 'Fecha de entrega no registrada'}
                {' · '}{order.garantiaDias} días de garantía
              </p>
              {onDeliveryReceipt && <button type="button" onClick={() => onDeliveryReceipt(order)} className="min-h-12 w-full px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm flex items-center justify-center gap-2"><MessageSquare className="h-4 w-4 shrink-0" />Enviar comprobante y garantía</button>}
            </section>
          )}
          {/* TAB 1: EXPEDIENTE & FICHA TÉCNICA */}
          {activeTab === 'expediente' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Technical Specifications */}
              <div className="p-4 rounded-lg bg-[#111114] border border-zinc-800/80 space-y-3">
                <h4 className="text-[11px] font-mono uppercase font-semibold text-zinc-400 tracking-wider">
                  ESPECIFICACIONES DEL DISPOSITIVO
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono">
                  <div>
                    <span className="text-[10px] text-zinc-400 block">CATEGORÍA</span>
                    <span className="text-zinc-200 font-sans">{category}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">MARCA / MODELO</span>
                    <span className="text-zinc-100 font-sans font-semibold">
                      {order.dispositivo.marca} {order.dispositivo.modelo}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">IMEI / N° SERIE</span>
                    <span className="text-zinc-200 select-all font-semibold">
                      {order.dispositivo.imei}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">COLOR</span>
                    <span className="text-zinc-200 font-sans">
                      {order.dispositivo.color || 'No especificado'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">BLOQUEO / PIN</span>
                    <span className="text-amber-400 font-bold">
                      {order.dispositivo.claveBloqueo || 'Sin clave'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">TÉCNICO ASIGNADO</span>
                    <span className="text-zinc-200 font-sans font-medium">
                      {order.tecnico ? order.tecnico.nombre : 'Sin asignar'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">GARANTÍA ESTÁNDAR</span>
                    <span className="text-emerald-400 font-bold">
                      {order.garantiaDias} Días
                    </span>
                  </div>
                </div>
              </div>

              {/* Declared Issue & Condition */}
              <div className="p-4 rounded-lg bg-[#111114] border border-zinc-800/80 space-y-3">
                <div>
                  <span className="text-[10px] font-mono uppercase font-semibold text-zinc-400 tracking-wider block mb-1">
                    FALLA DECLARADA POR EL CLIENTE
                  </span>
                  <p className="text-zinc-100 bg-[#1c1c20] p-2.5 rounded-lg border border-zinc-700/60 leading-relaxed font-medium">
                    {order.fallaDeclarada}
                  </p>
                </div>

                {order.preDiagnostico && (
                  <div>
                    <span className="text-[10px] font-mono uppercase font-semibold text-amber-400/90 tracking-wider block mb-1">
                      PRE-DIAGNÓSTICO / SOSPECHA DEL TÉCNICO
                    </span>
                    <p className="text-amber-200/90 bg-amber-950/20 p-2.5 rounded-lg border border-amber-800/40 leading-relaxed text-xs font-mono">
                      {order.preDiagnostico}
                    </p>
                  </div>
                )}

                <div>
                  <span className="text-[10px] font-mono uppercase font-semibold text-zinc-400 tracking-wider block mb-1">
                    OBSERVACIONES FÍSICAS DE ENTRADA
                  </span>
                  <p className="text-zinc-300 bg-[#1c1c20] p-2.5 rounded-lg border border-zinc-700/60">
                    {order.observacionesFisicas}
                  </p>
                </div>
              </div>

              {/* Reception Checklist Visualizer */}
              <div className="p-4 rounded-lg bg-[#111114] border border-zinc-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-mono uppercase font-semibold text-zinc-400 tracking-wider">
                    CHECKLIST DE RECEPCIÓN
                  </h4>
                  {order.checklist.equipoApagado && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/60 font-semibold">
                      ⚡ Equipo apagado / Sin encendido
                    </span>
                  )}
                </div>

                {order.checklist.equipoApagado ? (
                  <div className="p-3 rounded-lg bg-[#1c1c20] border border-amber-900/40 text-[11px] text-amber-300/90 font-mono">
                    ⚠️ El equipo ingresó apagado o sin encender. Las pruebas funcionales de este dispositivo se realizarán tras su encendido en laboratorio.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {checklistItems.map(({ key, label }) => {
                      const val = order.checklist[key];
                      return (
                        <div
                          key={key}
                          className={`p-2 rounded-lg border flex items-center justify-between text-[11px] ${
                            val === undefined
                              ? 'bg-[#1c1c20] border-zinc-700/60 text-zinc-500'
                              : val
                              ? 'bg-[#1c1c20] border-emerald-800/40 text-zinc-300'
                              : 'bg-rose-950/30 border-rose-900/50 text-rose-300 font-semibold'
                          }`}
                        >
                          <span>{label}</span>
                          <span
                            aria-label={val === undefined ? 'Sin registrar' : val ? 'Correcto' : 'Con falla'}
                            title={val === undefined ? 'Sin registrar' : val ? 'Correcto' : 'Con falla'}
                            className={`w-2 h-2 rounded-full ${
                              val === undefined ? 'bg-zinc-600' : val ? 'bg-emerald-400' : 'bg-rose-400'
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <section className="p-4 rounded-lg bg-[#111114] border border-zinc-800/80 space-y-3" aria-label="Evidencia fotográfica">
                <h4 className="text-[11px] font-mono uppercase font-semibold text-zinc-400 tracking-wider">
                  EVIDENCIA FOTOGRÁFICA ({order.fotosEvidencia?.length || 0})
                </h4>
                {order.fotosEvidencia?.length ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {order.fotosEvidencia.map((url, index) => (
                      <button
                        key={`${url}-${index}`}
                        type="button"
                        onClick={() => setPreviewPhoto({ orderId: order.id, url })}
                        aria-label={`Ampliar foto de evidencia ${index + 1}`}
                        className="aspect-square overflow-hidden rounded-lg border border-zinc-700 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-300"
                      >
                        <img src={url} alt={`Evidencia del equipo ${index + 1}`} loading="lazy" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-zinc-500">Aún no hay fotos de recepción o reparación.</p>
                )}
                <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Tomar foto de evidencia" onChange={handlePhotoSelection} disabled={photoUpload?.busy} />
                <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" aria-label="Subir fotos de evidencia" onChange={handlePhotoSelection} disabled={photoUpload?.busy} />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => cameraInput.current?.click()}
                    disabled={photoUpload?.busy}
                    className="min-h-11 px-3 py-2 flex items-center gap-2 rounded-lg bg-zinc-100 hover:bg-white disabled:opacity-50 text-zinc-950 font-semibold"
                  >
                    {photoUpload?.busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                    {photoUpload?.busy ? 'Guardando evidencia…' : '+ Tomar / Subir Foto'}
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    disabled={photoUpload?.busy}
                    className="min-h-11 px-3 py-2 flex items-center gap-2 rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    <ImagePlus className="w-4 h-4" /> Elegir archivos
                  </button>
                </div>
                {photoUpload?.busy && <p role="status" className="text-zinc-400">Comprimiendo a WebP y guardando en el expediente…</p>}
                {photoUpload?.orderId === order.id && photoUpload.error && <p role="alert" className="text-rose-300">{photoUpload.error}</p>}
              </section>
            </div>
          )}

          {/* TAB 2: NOTAS TÉCNICAS & BITÁCORA */}
          {activeTab === 'notas' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Add Note Form */}
              <form onSubmit={handleAddNoteSubmit} className="p-3.5 rounded-lg bg-[#111114] border border-zinc-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase font-semibold text-zinc-300">
                    NUEVA NOTA TÉCNICA
                  </span>
                  <select
                    value={newNoteType}
                    onChange={(e) => setNewNoteType(e.target.value as any)}
                    className="bg-[#1c1c20] text-zinc-300 text-[10px] px-2 py-0.5 rounded-lg border border-zinc-700/60"
                  >
                    <option value="diagnostico">Diagnóstico</option>
                    <option value="reparacion">Avance de Reparación</option>
                    <option value="repuesto">Pieza / Refacción</option>
                    <option value="general">Nota General</option>
                  </select>
                </div>
                <textarea
                  rows={2}
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Detalla el diagnóstico, mediciones en placa o procedimiento..."
                  className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none text-xs"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={!newNote.trim() || pendingAction !== null}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-white disabled:opacity-40 text-zinc-950 font-semibold text-xs transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{pendingAction === 'note' ? 'Guardando…' : 'Publicar Nota'}</span>
                  </button>
                </div>
              </form>

              {/* Notes Timeline */}
              <div className="space-y-3">
                {order.notasTecnicas.map((note) => (
                  <div
                    key={note.id}
                    className="p-3.5 rounded-lg bg-[#111114] border border-zinc-800/80 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-200">{note.autor}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 uppercase">
                          {note.tipo || 'nota'}
                        </span>
                      </div>
                      <span className="font-mono text-zinc-400">{note.fecha}</span>
                    </div>
                    <p className="text-zinc-300 leading-relaxed">{note.contenido}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: COSTOS & REPUESTOS ASIGNADOS */}
          {activeTab === 'repuestos' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Assign new part from inventory */}
              <div className="p-3.5 rounded-lg bg-[#111114] border border-zinc-800/80 space-y-2">
                <span className="text-[11px] font-mono uppercase font-semibold text-zinc-300 block">
                  ASIGNAR REFACCIÓN DESDE INVENTARIO
                </span>
                <div className="flex gap-2">
                  <select
                    value={selectedInventoryPartId}
                    disabled={pendingAction !== null}
                    onChange={(e) => setSelectedInventoryPartId(e.target.value)}
                    className="flex-1 bg-[#1c1c20] text-zinc-100 px-3 py-1.5 rounded-lg border border-zinc-700/60 text-xs focus:outline-none"
                  >
                    <option value="">— Seleccionar repuesto disponible —</option>
                    {inventory.map((inv) => (
                      <option key={inv.id} value={inv.id} disabled={inv.stockActual <= 0}>
                        {inv.nombre} (${inv.precioVenta} MXN) - Stock: {inv.stockActual}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAssignPartSubmit}
                    disabled={!selectedInventoryPartId || pendingAction !== null}
                    className="px-3.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-white disabled:opacity-40 text-zinc-950 font-semibold text-xs shrink-0"
                  >
                    {pendingAction === 'part' ? 'Guardando…' : '+ Asignar'}
                  </button>
                </div>
              </div>

              {/* Parts list table */}
              <div className="rounded-lg border border-zinc-800/80 overflow-hidden bg-[#111114]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#0c0c0e] text-[10px] font-mono uppercase text-zinc-400 border-b border-zinc-800">
                    <tr>
                      <th className="py-2.5 px-3">REPUESTO / SKU</th>
                      <th className="py-2.5 px-3 text-center">CANTIDAD</th>
                      <th className="py-2.5 px-3 text-right">PRECIO</th>
                      <th className="py-2.5 px-3 text-right">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {order.repuestosAsignados.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-zinc-400 font-sans">
                          No se han asignado refacciones físicas a esta orden aún.
                        </td>
                      </tr>
                    ) : (
                      order.repuestosAsignados.map((p) => (
                        <tr key={p.id} className="text-zinc-300 hover:bg-zinc-800/40">
                          <td className="py-2.5 px-3">
                            <span className="font-sans font-medium text-zinc-100 block">
                              {p.nombre}
                            </span>
                            <span className="text-[10px] text-zinc-400">{p.sku}</span>
                          </td>
                          <td className="py-2.5 px-3 text-center">{p.cantidad}</td>
                          <td className="py-2.5 px-3 text-right text-zinc-300">${p.precioUnitario}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-zinc-100">
                            ${p.precioUnitario * p.cantidad}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Financial summary breakdown */}
              <div className="p-4 rounded-lg bg-[#111114] border border-zinc-800/80 space-y-2 text-xs font-mono">
                <div className="flex justify-between text-zinc-400">
                  <span>Mano de Obra & Diagnóstico:</span>
                  <span className="text-zinc-200 font-bold">${order.costoManoObra} MXN</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Total Refacciones / Piezas:</span>
                  <span className="text-zinc-200 font-bold">${totalPiezas} MXN</span>
                </div>
                <div className="pt-2 border-t border-zinc-800 flex justify-between text-sm">
                  <span className="font-bold text-zinc-100 font-sans">Total a Cobrar:</span>
                  <span className="font-bold text-emerald-400 text-base">
                    ${totalCobro.toLocaleString()} MXN
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer Actions */}
        <div className="p-4 border-t border-zinc-800/80 bg-[#111114] flex items-center justify-between shrink-0">
          <button
            onClick={() => onOpenWhatsApp(order)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Enviar Actualización WhatsApp</span>
          </button>

          <button
            onClick={() => onPrintTicket(order)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Ticket de Recepción</span>
          </button>
        </div>
      </div>
      {previewPhoto?.orderId === order.id && (
        <EvidencePreview url={previewPhoto.url} onClose={() => setPreviewPhoto(null)} />
      )}
    </div>
  );
};
