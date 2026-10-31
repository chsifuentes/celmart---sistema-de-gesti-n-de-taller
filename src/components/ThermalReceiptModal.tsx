import React, { useEffect, useRef, useState } from 'react';
import { X, Printer, Copy, Check, MessageCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { CHECKLIST_BY_CATEGORY, Order, WorkshopConfig } from '../types';
import { getTrackingUrl } from '../lib/trackingUrl';

interface ThermalReceiptModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  config: WorkshopConfig;
  onSendDelivery?: (order: Order) => void;
}

export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = ({ order, isOpen, onClose, config, onSendDelivery }) => {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setCopied(false);
    setCopyError('');
    return () => clearTimeout(copyTimer.current);
  }, [order?.id, isOpen]);

  if (!isOpen || !order) return null;

  const totalPiezas = order.repuestosAsignados.reduce((sum, part) => sum + part.precioUnitario * part.cantidad, 0);
  const totalCobro = order.costoManoObra + totalPiezas;
  const money = (value: number) => `${config.simboloMoneda || '$'}${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const paperWidth = config.anchoTicket === '58mm' ? '58mm' : '80mm';
  const trackingUrl = getTrackingUrl(order.id);
  const isDelivery = order.estado === 'Entregado';
  const deliveredDate = order.fechaEntrega ? new Date(order.fechaEntrega) : null;
  const deliveryDate = deliveredDate && !Number.isNaN(deliveredDate.getTime())
    ? deliveredDate.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'No registrada';
  const category = order.dispositivo.categoria ?? 'Smartphone';
  const templateItems = CHECKLIST_BY_CATEGORY[category];
  const checklistItems = [
    ...templateItems,
    ...Object.keys(order.checklist).filter((key) => key !== 'equipoApagado' && !templateItems.some((item) => item.key === key)).map((key) => ({ key, label: key })),
  ];
  const checkResult = (key: string) => order.checklist[key] === undefined ? 'Sin comprobar' : order.checklist[key] ? 'OK' : 'Revisar';

  const handleCopyText = async () => {
    const textReceipt = [
      config.nombreTaller.toUpperCase(), config.direccion, `Tel / WhatsApp: ${config.telefono}`, `RFC: ${config.rfc}`,
      `COMPROBANTE DE ${isDelivery ? 'ENTREGA' : 'RECEPCIÓN'}: ${order.id}`,
      `Fecha de ingreso: ${order.ingreso}`, ...(isDelivery ? [`Fecha de entrega: ${deliveryDate}`] : []),
      `Cliente: ${order.cliente.nombre}`, `Teléfono: ${order.cliente.telefono}`,
      `Equipo: ${order.dispositivo.marca} ${order.dispositivo.modelo}`, `Categoría: ${category}`, `IMEI / Serie: ${order.dispositivo.imei}`,
      '', `Falla declarada: ${order.fallaDeclarada}`, `Observaciones físicas: ${order.observacionesFisicas}`,
      '', `Mano de obra: ${money(order.costoManoObra)} MXN`,
      ...order.repuestosAsignados.map((part) => `${part.cantidad} × ${part.nombre}: ${money(part.cantidad * part.precioUnitario)} MXN`),
      `${isDelivery ? 'Total del servicio' : 'Total estimado'}: ${money(totalCobro)} MXN`,
      '', `Garantía: ${order.garantiaDias} días conforme a la política del taller.`, config.politicaGarantiaTexto,
      '', `Seguimiento de tu reparación: ${trackingUrl}`, '', 'Firma de conformidad del cliente: ____________________',
    ].join('\n');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(textReceipt);
      setCopyError('');
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopyError('No se pudo copiar. Puedes seleccionar el texto del comprobante o imprimirlo.');
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Comprobante ${order.id}`} className="thermal-receipt-modal fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <style>{`
        @media print {
          @page { margin: 0; }
          html, body, #root { margin: 0 !important; height: auto !important; overflow: visible !important; }
          #root > * { display: block !important; height: auto !important; overflow: visible !important; }
          #root > * > :not(.thermal-receipt-modal) { display: none !important; }
          .thermal-receipt-modal, .thermal-receipt-content, .thermal-receipt-paper-wrap {
            display: block !important; position: static !important; width: auto !important;
            height: auto !important; max-height: none !important; margin: 0 !important;
            padding: 0 !important; overflow: visible !important; border: 0 !important;
            background: white !important; box-shadow: none !important;
          }
          .thermal-receipt-controls { display: none !important; }
          #thermal-receipt-printable {
            position: static !important; width: ${paperWidth} !important; max-width: none !important;
            box-sizing: border-box !important; margin: 0 !important; padding: 3mm !important;
            box-shadow: none !important; border-radius: 0 !important; color: black !important;
          }
          #thermal-receipt-printable svg { width: 32mm !important; height: 32mm !important; }
          #thermal-receipt-printable a { color: black !important; text-decoration: none !important; }
        }
      `}</style>
      <div className="thermal-receipt-content bg-[#161619] border border-zinc-700/80 rounded-lg w-full max-w-lg max-h-[92dvh] shadow-2xl overflow-hidden flex flex-col">
        <div className="thermal-receipt-controls p-4 border-b border-zinc-800 flex items-center justify-between bg-[#111114] shrink-0 gap-3">
          <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2"><Printer className="w-4 h-4" /> Comprobante térmico · {paperWidth}</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar comprobante" className="text-zinc-400 hover:text-zinc-200 p-2 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <div className="thermal-receipt-paper-wrap p-4 sm:p-6 bg-[#0c0c0e] flex justify-center overflow-y-auto min-h-0">
          <div id="thermal-receipt-printable" data-paper-width={paperWidth} style={{ width: paperWidth, maxWidth: '100%', padding: '3mm' }} className="shrink-0 bg-white text-zinc-900 font-mono text-[10px] shadow-2xl leading-snug select-text break-words">
            <div className="text-center space-y-1 pb-3 border-b border-dashed border-zinc-400">
              <div className="w-8 h-8 mx-auto bg-zinc-900 text-white rounded font-bold flex items-center justify-center text-xs">CM</div>
              <h2 className="font-bold text-sm tracking-wide uppercase">{config.nombreTaller}</h2>
              <p className="text-[9px]">SERVICIO TÉCNICO DE PRECISIÓN</p>
              <p className="text-[9px]">{config.direccion}</p>
              <p className="font-semibold">Tel / WA: {config.telefono}</p>
              <p className="text-[9px]">RFC: {config.rfc}</p>
            </div>

            <div className="py-2.5 border-b border-dashed border-zinc-400 text-center space-y-1">
              <span className="text-[9px] uppercase block">COMPROBANTE DE {isDelivery ? 'ENTREGA' : 'RECEPCIÓN'}</span>
              <div className="font-bold text-base tracking-wider">{order.id}</div>
              <p className="text-[9px]">Ingreso: {order.ingreso}</p>
              {isDelivery && <p className="text-[9px]">Entrega: {deliveryDate}</p>}
              <p className="text-[9px]">Estado: {order.estado}</p>
            </div>

            <div className="py-2.5 border-b border-dashed border-zinc-400 space-y-1">
              <h4 className="text-[9px] uppercase font-bold">DATOS DEL CLIENTE</h4>
              <p><strong>Cliente:</strong> {order.cliente.nombre}</p>
              <p><strong>Teléfono:</strong> {order.cliente.telefono}</p>
            </div>

            <div className="py-2.5 border-b border-dashed border-zinc-400 space-y-1">
              <h4 className="text-[9px] uppercase font-bold">DATOS DEL DISPOSITIVO</h4>
              <p><strong>Equipo:</strong> {order.dispositivo.marca} {order.dispositivo.modelo}</p>
              <p><strong>Categoría:</strong> {category}</p>
              <p><strong>IMEI / Serie:</strong> {order.dispositivo.imei}</p>
              <p><strong>Color:</strong> {order.dispositivo.color || 'No especificado'}</p>
            </div>

            <div className="py-2.5 border-b border-dashed border-zinc-400 space-y-1">
              <h4 className="text-[9px] uppercase font-bold">FALLA REPORTADA</h4>
              <p>{order.fallaDeclarada}</p>
              <h4 className="text-[9px] uppercase font-bold pt-1">OBSERVACIONES FÍSICAS</h4>
              <p>{order.observacionesFisicas}</p>
              <h4 className="text-[9px] uppercase font-bold pt-1">CHECKLIST DE RECEPCIÓN</h4>
              {order.checklist.equipoApagado ? (
                <p className="font-bold text-[9px]">Equipo apagado / no enciende. Pruebas funcionales pendientes.</p>
              ) : (
                <div className="grid grid-cols-2 gap-x-2 text-[8px]">
                  {checklistItems.map(({ key, label }) => <p key={key}>{label}: <strong>{checkResult(key)}</strong></p>)}
                </div>
              )}
            </div>

            <div className="py-2.5 border-b border-dashed border-zinc-400 space-y-1">
              <div className="flex justify-between gap-2"><span>Mano de obra:</span><span>{money(order.costoManoObra)}</span></div>
              {order.repuestosAsignados.map((part) => (
                <div key={part.id} className="flex justify-between gap-2 text-[9px]"><span>{part.cantidad} × {part.nombre}</span><span className="shrink-0">{money(part.precioUnitario * part.cantidad)}</span></div>
              ))}
              <div className="flex justify-between gap-2 font-bold text-[11px] pt-1 border-t border-zinc-300"><span>{isDelivery ? 'TOTAL DEL SERVICIO:' : 'TOTAL ESTIMADO:'}</span><span className="shrink-0">{money(totalCobro)} MXN</span></div>
            </div>

            {order.metodoPago && <p className="text-[9px]">Cobrado: {money(order.montoCobrado??0)} · {order.metodoPago}</p>}
            <div className="py-3 text-center border-b border-dashed border-zinc-400" style={{ breakInside: 'avoid' }}>
              <p className="text-[10px] font-bold">Sigue tu reparación</p>
              <QRCodeSVG value={trackingUrl} size={144} level="M" marginSize={4} bgColor="#ffffff" fgColor="#000000" title={`Seguimiento de la orden ${order.id}`} style={{ width: '32mm', height: '32mm', margin: '1mm auto', display: 'block' }} />
              <p className="text-[8px]">Escanea el código con la cámara de tu celular.</p>
              <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="block mt-1 text-[8px] break-all underline">{trackingUrl}</a>
            </div>

            <div className="pt-3 text-[8px] space-y-3 text-center" style={{ breakInside: 'avoid' }}>
              <p>{config.politicaGarantiaTexto}</p>
              <p className="font-bold">Garantía: {order.garantiaDias} días conforme a la política del taller.</p>
              <div className="pt-6">
                <div className="border-t border-zinc-900 pt-1 font-bold">FIRMA DE CONFORMIDAD DEL CLIENTE</div>
                <p>Acepto los términos y el estado del equipo al recibir este comprobante.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="thermal-receipt-controls p-4 border-t border-zinc-800 bg-[#111114] flex flex-wrap items-center justify-between gap-2 shrink-0">
          {copyError && <p role="alert" className="w-full text-xs text-rose-300">{copyError}</p>}
          <button type="button" onClick={() => void handleCopyText()} className="flex items-center gap-1.5 min-h-11 px-3 py-2 rounded-lg bg-zinc-800 text-zinc-200 border border-zinc-700 text-xs">
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}{copied ? 'Copiado' : 'Copiar texto'}
          </button>
          {isDelivery && onSendDelivery && <button type="button" onClick={() => onSendDelivery(order)} className="flex items-center gap-2 min-h-11 px-3 py-2 rounded-lg bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs"><MessageCircle className="w-4 h-4" /> Enviar por WhatsApp</button>}
          <button type="button" onClick={() => window.print()} className="flex items-center gap-2 min-h-11 px-4 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs"><Printer className="w-4 h-4" /> Imprimir · {paperWidth}</button>
        </div>
      </div>
    </div>
  );
};
