import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  MessageSquare, 
  Copy, 
  Check, 
  ExternalLink, 
  RotateCcw, 
  Sparkles, 
  Phone, 
  FileText,
  UserCheck,
  Loader2
} from 'lucide-react';
import { Order, WorkshopConfig, WhatsAppTemplateKey } from '../types';
import { 
  replaceWhatsAppVariables, 
  formatWhatsAppPhone, 
  buildWhatsAppLink, 
  determineTemplateKeyForStatus,
  defaultWhatsAppTemplates,
  isValidWhatsAppPhone,
  sendAutomatedWhatsApp
} from '../lib/whatsapp';

interface WhatsAppPreviewModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  config: WorkshopConfig;
  initialTemplateKey?: WhatsAppTemplateKey;
  manualFallbackReason?: string;
  initialMessage?: string;
  onSentWhatsApp?: (orderId: string, logNote: string) => Promise<void> | void;
}

const templateOptions: { key: WhatsAppTemplateKey; label: string; icon: string }[] = [
  { key: 'ingreso', label: 'Ingreso / Recepción', icon: '📥' },
  { key: 'cambioEstatus', label: 'Cambio de Estatus', icon: '🔄' },
  { key: 'listoEntrega', label: 'Listo para Entrega', icon: '🎉' },
  { key: 'cotizacionPendiente', label: 'Cotización / Presupuesto', icon: '📋' },
];

export const WhatsAppPreviewModal: React.FC<WhatsAppPreviewModalProps> = ({
  order,
  isOpen,
  onClose,
  config,
  initialTemplateKey,
  manualFallbackReason,
  initialMessage,
  onSentWhatsApp,
}) => {
  const [selectedKey, setSelectedKey] = useState<WhatsAppTemplateKey>('cambioEstatus');
  const [messageText, setMessageText] = useState('');
  const [copied, setCopied] = useState(false);
  const [sendStatus, setSendStatus] = useState<'idle' | 'api' | 'manual'>('idle');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showManualFallback, setShowManualFallback] = useState(false);
  const pending = useRef(false);
  const draftSession = useRef<string | null>(null);
  const requestVersion = useRef(0);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inicializar o actualizar el mensaje cuando cambie la orden o se abra el modal
  useEffect(() => {
    if (!order || !isOpen) {
      draftSession.current = null;
      requestVersion.current += 1;
      pending.current = false;
      setIsSending(false);
      return;
    }
    const sessionKey = `${order.id}:${initialTemplateKey ?? ''}:${initialMessage ? 'comprobante' : 'actualizacion'}`;
    // Realtime order refreshes must not replace an edited draft or reset its send guard.
    if (draftSession.current !== sessionKey) {
      draftSession.current = sessionKey;
      requestVersion.current += 1;
      pending.current = false;
      const initialKey = initialTemplateKey || determineTemplateKeyForStatus(order.estado);
      setSelectedKey(initialKey);
      
      const templates = config?.plantillasWhatsApp || defaultWhatsAppTemplates;
      const rawTemplate = templates[initialKey] || defaultWhatsAppTemplates[initialKey];
      const compiled = replaceWhatsAppVariables(rawTemplate, order, config);
      setMessageText(initialMessage ?? compiled);
      setSendStatus('idle');
      setIsSending(false);
      setErrorMessage(manualFallbackReason ?? null);
      setShowManualFallback(Boolean(manualFallbackReason));
      setCopied(false);
    }
  }, [order, isOpen, initialTemplateKey, config, manualFallbackReason, initialMessage]);

  useEffect(() => () => {
    requestVersion.current += 1;
    if (copyTimeout.current) clearTimeout(copyTimeout.current);
  }, []);

  if (!isOpen || !order) return null;

  const templates = config?.plantillasWhatsApp || defaultWhatsAppTemplates;
  const rawPhone = order.cliente?.telefono || '';
  const formattedPhone = formatWhatsAppPhone(rawPhone);
  const phoneValid = isValidWhatsAppPhone(rawPhone);
  const manualUrl = buildWhatsAppLink(rawPhone, messageText);
  const apiEnabled = Boolean(config.whatsappAutoSend && config.whatsappApiUrl?.trim());

  const handleSelectTemplate = (key: WhatsAppTemplateKey) => {
    setSelectedKey(key);
    const rawTemplate = templates[key] || defaultWhatsAppTemplates[key];
    const compiled = replaceWhatsAppVariables(rawTemplate, order, config);
    setMessageText(compiled);
  };

  const handleResetCurrentTemplate = () => {
    const rawTemplate = templates[selectedKey] || defaultWhatsAppTemplates[selectedKey];
    const compiled = replaceWhatsAppVariables(rawTemplate, order, config);
    setMessageText(initialMessage ?? compiled);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setCopied(true);
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      setErrorMessage('No se pudo copiar. Puedes seleccionar y copiar el texto del mensaje.');
    }
  };

  const recordCommunication = async (via: 'api' | 'manual', version: number) => {
    const template = initialMessage ? 'Comprobante final y garantía' : templateOptions.find((option) => option.key === selectedKey)?.label || 'Actualización';
    const logNote = via === 'api'
      ? `Solicitud de WhatsApp aceptada por la API (${template}). Entrega al teléfono pendiente de confirmación.`
      : `Se abrió el enlace de WhatsApp (${template}). Envío manual pendiente de confirmación.`;
    try {
      await onSentWhatsApp?.(order.id, logNote);
    } catch {
      if (requestVersion.current === version) {
        setErrorMessage(via === 'api'
          ? 'La API aceptó la solicitud, pero no se pudo registrar en el expediente. No la reenvíes; revisa el historial.'
          : 'Se abrió WhatsApp, pero no se pudo registrar en el expediente. El envío debe completarse manualmente.');
      }
    }
  };

  const handleSendWhatsApp = async () => {
    if (pending.current || sendStatus !== 'idle') return;
    if (!phoneValid || !messageText.trim()) {
      setErrorMessage('Revisa el teléfono del cliente y escribe un mensaje antes de continuar.');
      return;
    }
    pending.current = true;
    const version = requestVersion.current;
    setIsSending(true);
    setErrorMessage(null);
    let reservedWindow: Window | null = null;
    const attemptApi = apiEnabled && !showManualFallback;
    try {
      // Reserve during the click gesture; opening a tab after await may be blocked.
      try {
        reservedWindow = window.open(attemptApi ? 'about:blank' : manualUrl, '_blank');
        if (reservedWindow) {
          reservedWindow.opener = null;
          if (attemptApi) {
            reservedWindow.document.title = 'Preparando WhatsApp';
            reservedWindow.document.body.textContent = 'Comprobando el envío por API. Esta pestaña se cerrará si la solicitud se acepta.';
          }
        }
      } catch {
        reservedWindow?.close();
        reservedWindow = null;
      }

      if (attemptApi) {
        const result = await sendAutomatedWhatsApp(order, messageText, config);
        if (requestVersion.current !== version) {
          reservedWindow?.close();
          return;
        }
        if (result.sentViaApi) {
          reservedWindow?.close();
          setSendStatus('api');
          await recordCommunication('api', version);
          return;
        }
        setErrorMessage(result.error ?? 'La API no está disponible. Continúa con el mensaje preparado en WhatsApp.');
        setShowManualFallback(true);
        if (reservedWindow && !reservedWindow.closed) {
          reservedWindow.location.replace(manualUrl);
        } else {
          reservedWindow = null;
        }
      }

      if (reservedWindow && !reservedWindow.closed) {
        setSendStatus('manual');
        await recordCommunication('manual', version);
      } else {
        setShowManualFallback(true);
        setErrorMessage((previous) => `${previous ? `${previous} ` : ''}No se confirmó la apertura de la pestaña. Usa el enlace «Abrir WhatsApp manual» de abajo.`);
      }
    } catch {
      reservedWindow?.close();
      if (requestVersion.current === version) {
        setShowManualFallback(true);
        setErrorMessage((previous) => `${previous ? `${previous} ` : ''}No se pudo abrir WhatsApp. Tu mensaje sigue disponible; utiliza el enlace manual.`);
      }
    } finally {
      if (requestVersion.current === version) {
        pending.current = false;
        setIsSending(false);
      }
    }
  };

  const handleManualLink = () => {
    if (sendStatus === 'idle') {
      setSendStatus('manual');
      void recordCommunication('manual', requestVersion.current);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div role="dialog" aria-modal="true" aria-labelledby="whatsapp-preview-title" aria-busy={isSending} className="bg-[#161619] border border-zinc-700/80 rounded-xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col my-auto max-h-[95vh]">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 bg-[#111114] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-700/60 flex items-center justify-center text-emerald-400">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="whatsapp-preview-title" className="text-sm font-semibold text-zinc-100">
                  Comunicación WhatsApp CelMart
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/50 text-emerald-300 border border-emerald-800/60 font-medium">
                  {order.id}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Cliente: <span className="text-zinc-200 font-medium">{order.cliente.nombre}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSending}
            className="text-zinc-400 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-800/60 transition-colors"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs">
          {/* Recipient info badge */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-[#111114] border border-zinc-800/80 font-mono text-[11px]">
            <div className="flex items-center gap-2 text-zinc-300">
              <Phone className="w-3.5 h-3.5 text-emerald-400" />
              <span>Teléfono: <span className="text-zinc-100 font-bold">{order.cliente.telefono}</span></span>
              <span className="text-zinc-500">({formattedPhone || 'Sin formato'})</span>
            </div>
            <div className="text-zinc-400">
              Estado: <span className="text-zinc-200 font-semibold">{order.estado}</span>
            </div>
          </div>

          {/* Plantilla Selector Buttons */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-zinc-300 font-mono text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-zinc-400" />
                Selecciona la Plantilla de Mensaje
              </label>
              <button
                type="button"
                onClick={handleResetCurrentTemplate}
                disabled={isSending || sendStatus !== 'idle'}
                className="text-zinc-400 hover:text-zinc-200 text-[11px] flex items-center gap-1 font-mono transition-colors"
                title="Restablecer a la plantilla base"
              >
                <RotateCcw className="w-3 h-3" />
                Restablecer
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {templateOptions.map((opt) => {
                const isSelected = selectedKey === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => handleSelectTemplate(opt.key)}
                    disabled={isSending || sendStatus !== 'idle'}
                    className={`p-2.5 rounded-lg border text-left transition-all flex items-center gap-2 ${
                      isSelected
                        ? 'bg-emerald-950/40 border-emerald-600/70 text-emerald-200 font-medium shadow-sm'
                        : 'bg-[#1c1c20] border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span className="text-sm">{opt.icon}</span>
                    <span className="truncate text-xs">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Variables hint */}
          <div className="flex items-center flex-wrap gap-1.5 pt-1 text-[10px] font-mono text-zinc-400">
            <span className="text-zinc-500">Variables dinámicas:</span>
            <span className="bg-zinc-800/80 px-1.5 py-0.5 rounded text-zinc-300">
              {order.cliente.nombre}
            </span>
            <span className="bg-zinc-800/80 px-1.5 py-0.5 rounded text-zinc-300">
              {order.dispositivo.modelo}
            </span>
            <span className="bg-zinc-800/80 px-1.5 py-0.5 rounded text-zinc-300">
              {order.id}
            </span>
            <span className="bg-zinc-800/80 px-1.5 py-0.5 rounded text-zinc-300">
              {order.tecnico?.nombre || 'Técnico'}
            </span>
          </div>

          {/* Editable Text Area */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <label htmlFor="whatsapp-message-text" className="font-mono">Mensaje a enviar (puedes editarlo):</label>
              <span className="font-mono text-zinc-500">{messageText.length} caracteres</span>
            </div>
            <textarea
              id="whatsapp-message-text"
              rows={7}
              disabled={isSending || sendStatus !== 'idle'}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="w-full bg-[#111114] border border-zinc-700/80 focus:border-emerald-500 focus:outline-none rounded-lg p-3 text-zinc-100 text-xs font-sans leading-relaxed resize-none shadow-inner"
              placeholder="Escribe el mensaje para el cliente..."
            />
          </div>

          {/* Link format preview */}
          <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 text-[10px] font-mono text-zinc-400 flex items-center justify-between">
            <span className="truncate">
              Enlace directo: <span className="text-emerald-400">https://wa.me/{formattedPhone || '521XXXXXXXXXX'}?text=...</span>
            </span>
            <span className="text-zinc-500 shrink-0 ml-2">{apiEnabled ? 'API + respaldo manual' : 'WhatsApp manual'}</span>
          </div>
          {!phoneValid && <p role="alert" className="text-xs text-amber-300">El teléfono registrado no tiene un formato válido para WhatsApp.</p>}
          {errorMessage && <p role="alert" className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-3 text-xs text-amber-200">{errorMessage}</p>}
          {sendStatus !== 'idle' && (
            <p role="status" className="rounded-lg border border-emerald-800/60 bg-emerald-950/30 p-3 text-xs text-emerald-200">
              {sendStatus === 'api' ? 'Solicitud aceptada por la API. La entrega al teléfono todavía no está confirmada.' : 'Se abrió WhatsApp con tu mensaje. Revísalo y completa el envío desde WhatsApp.'}
            </p>
          )}
          {showManualFallback && phoneValid && messageText.trim() && (
            <a href={manualUrl} target="_blank" rel="noopener noreferrer" onClick={handleManualLink} className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 px-4 py-3 text-sm font-semibold text-emerald-300 hover:bg-emerald-950/30">
              <ExternalLink className="h-4 w-4" /> Abrir WhatsApp manual
            </a>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 bg-[#111114] flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleCopy}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#1c1c20] hover:bg-zinc-800 text-zinc-300 border border-zinc-700/60 text-xs font-mono transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? '¡Copiado al portapapeles!' : 'Copiar Texto'}</span>
          </button>

          <div className="w-full sm:w-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="w-1/2 sm:w-auto px-4 py-2 rounded-lg bg-[#1c1c20] hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 text-xs transition-colors"
            >
              {sendStatus === 'idle' ? 'Cancelar' : 'Cerrar'}
            </button>
            <button
              type="button"
              id="btn-send-whatsapp-now"
              onClick={handleSendWhatsApp}
              disabled={isSending || sendStatus !== 'idle' || !phoneValid || !messageText.trim()}
              className="w-1/2 sm:w-auto flex items-center justify-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /><span>Procesando...</span></>
              ) : sendStatus !== 'idle' ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{sendStatus === 'api' ? 'Aceptado por API' : 'WhatsApp abierto'}</span>
                </>
              ) : (
                <>
                  <MessageSquare className="w-4 h-4" />
                  <span>{apiEnabled && !showManualFallback ? 'Enviar por API' : 'Abrir WhatsApp'}</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
