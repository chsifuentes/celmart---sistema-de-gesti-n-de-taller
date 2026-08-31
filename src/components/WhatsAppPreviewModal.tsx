import React, { useState } from 'react';
import { X, MessageSquare, Copy, Check, Send, ExternalLink } from 'lucide-react';
import { Order, WorkshopConfig } from '../types';

interface WhatsAppPreviewModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  config: WorkshopConfig;
}

export const WhatsAppPreviewModal: React.FC<WhatsAppPreviewModalProps> = ({
  order,
  isOpen,
  onClose,
  config,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !order) return null;

  const totalPiezas = order.repuestosAsignados.reduce(
    (sum, p) => sum + p.precioUnitario * p.cantidad,
    0
  );
  const totalCobro = order.costoManoObra + totalPiezas;

  const cleanPhone = order.cliente.telefono.replace(/[^0-9]/g, '');

  const messageText = `Hola *${order.cliente.nombre}* 👋

Te contactamos del servicio técnico *${config.nombreTaller}*.
Te compartimos el estado de tu dispositivo:

📱 *Equipo:* ${order.dispositivo.marca} ${order.dispositivo.modelo}
🏷️ *Orden de Servicio:* ${order.id}
🔍 *Estado Actual:* *${order.estado.toUpperCase()}*

${order.estado === 'Listo' ? '🎉 ¡Tu equipo ya ha pasado el control de calidad final y está listo para ser retirado en sucursal!' : order.estado === 'En Reparación' ? '⚙️ El equipo se encuentra en mesa de trabajo con nuestro especialista.' : order.estado === 'Esperando Repuesto' ? '📦 Las refacciones originales para tu equipo están en tránsito.' : '🔬 Nuestro equipo técnico se encuentra realizando las mediciones diagnósticas.'}

💵 *Total a liquidar:* $${totalCobro.toLocaleString()} MXN
📍 *Sucursal:* ${config.direccion}
🕒 *Horario:* Lun - Sáb: 09:00 - 19:00 hrs

¡Gracias por tu preferencia!
*${config.nombreTaller} - Soporte Técnico*`;

  const handleCopy = () => {
    navigator.clipboard.writeText(messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOpenWhatsApp = () => {
    const encoded = encodeURIComponent(messageText);
    const url = `https://wa.me/${cleanPhone}?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#161619] border border-zinc-700/80 rounded-lg w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 bg-[#111114] flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-400">
            <MessageSquare className="w-4 h-4" />
            <h3 className="text-sm font-semibold text-zinc-100">
              Notificación WhatsApp para {order.cliente.nombre}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs">
          <div className="flex items-center justify-between text-zinc-400 font-mono text-[11px]">
            <span>Destinatario: <span className="text-zinc-200 font-semibold">{order.cliente.telefono}</span></span>
            <span>Orden: <span className="text-zinc-200 font-semibold">{order.id}</span></span>
          </div>

          <div className="p-4 rounded-lg bg-[#111114] border border-zinc-800/80 font-sans text-zinc-200 text-xs whitespace-pre-line leading-relaxed select-text shadow-inner">
            {messageText}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 bg-[#111114] flex items-center justify-between">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1c1c20] hover:bg-zinc-800 text-zinc-300 border border-zinc-700/60 text-xs transition-colors font-mono"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? '¡Copiado!' : 'Copiar Mensaje'}</span>
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-[#1c1c20] hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 text-xs transition-colors"
            >
              Cerrar
            </button>
            <button
              onClick={handleOpenWhatsApp}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition-colors"
            >
              <span>Abrir en WhatsApp</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
