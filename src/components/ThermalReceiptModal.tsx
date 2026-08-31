import React, { useRef } from 'react';
import { X, Printer, Copy, Check, QrCode } from 'lucide-react';
import { Order, WorkshopConfig } from '../types';

interface ThermalReceiptModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  config: WorkshopConfig;
}

export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = ({
  order,
  isOpen,
  onClose,
  config,
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen || !order) return null;

  const totalPiezas = order.repuestosAsignados.reduce(
    (sum, p) => sum + p.precioUnitario * p.cantidad,
    0
  );
  const totalCobro = order.costoManoObra + totalPiezas;

  const handlePrint = () => {
    window.print();
  };

  const handleCopyText = () => {
    const textReceipt = `
========================================
           ${config.nombreTaller.toUpperCase()}
   SERVICIO TÉCNICO ESPECIALIZADO
 ${config.direccion}
 Tel / WhatsApp: ${config.telefono}
 RFC: ${config.rfc}
========================================
ORDEN DE SERVICIO: ${order.id}
FECHA INGRESO: ${order.ingreso}
ESTADO: ${order.estado}
----------------------------------------
DATOS DEL CLIENTE:
Nombre:   ${order.cliente.nombre}
Teléfono: ${order.cliente.telefono}
----------------------------------------
DATOS DEL EQUIPO:
Dispositivo: ${order.dispositivo.marca} ${order.dispositivo.modelo}
IMEI/Serie:  ${order.dispositivo.imei}
Color:       ${order.dispositivo.color || 'N/A'}
Clave/PIN:   ${order.dispositivo.claveBloqueo || 'Sin clave'}
----------------------------------------
FALLA DECLARADA:
${order.fallaDeclarada}

OBSERVACIONES FÍSICAS:
${order.observacionesFisicas}
----------------------------------------
DESGLOSE ESTIMADO:
Mano de Obra:    $${order.costoManoObra} MXN
Refacciones:     $${totalPiezas} MXN
TOTAL:           $${totalCobro} MXN
----------------------------------------
TÉRMINOS DE GARANTÍA:
${config.politicaGarantiaTexto}
Garantía válida por: ${order.garantiaDias} días.

Firma de Conformidad del Cliente:

________________________________________
========================================
`;
    navigator.clipboard.writeText(textReceipt.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#161619] border border-zinc-700/80 rounded-lg w-full max-w-lg shadow-2xl overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150 flex flex-col">
        {/* Modal Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-[#111114]">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-zinc-300" />
            <h3 className="text-sm font-semibold text-zinc-100">
              Vista Previa Comprobante Térmico (80mm)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Printable Receipt Paper Visual */}
        <div className="p-6 bg-[#0c0c0e] flex justify-center overflow-y-auto max-h-[70vh]">
          <div
            id="thermal-receipt-printable"
            className="w-full max-w-[340px] bg-white text-zinc-900 font-mono text-[11px] p-5 shadow-2xl rounded-sm leading-tight select-text"
          >
            {/* Store Branding */}
            <div className="text-center space-y-1 pb-3 border-b border-dashed border-zinc-400">
              <div className="w-8 h-8 mx-auto bg-zinc-900 text-white rounded font-bold flex items-center justify-center text-xs">
                CM
              </div>
              <h2 className="font-bold text-sm tracking-wider uppercase">
                {config.nombreTaller}
              </h2>
              <p className="text-[10px] text-zinc-600">
                SERVICIO TÉCNICO DE PRECISIÓN
              </p>
              <p className="text-[9px] text-zinc-600 leading-tight">
                {config.direccion}
              </p>
              <p className="text-[10px] font-semibold text-zinc-800">
                Tel / WA: {config.telefono}
              </p>
              <p className="text-[9px] text-zinc-500">RFC: {config.rfc}</p>
            </div>

            {/* Ticket Identifier & Barcode simulation */}
            <div className="py-2.5 border-b border-dashed border-zinc-400 text-center space-y-1">
              <span className="text-[10px] text-zinc-500 uppercase block">
                COMPROBANTE DE RECEPCIÓN
              </span>
              <div className="font-bold text-base tracking-widest bg-zinc-100 py-1 rounded">
                {order.id}
              </div>
              {/* Monospace barcode simulation */}
              <div className="tracking-[4px] text-[13px] font-bold select-none text-zinc-700">
                ||| | |||| || ||| |||| |
              </div>
              <div className="text-[9px] text-zinc-500">
                Ingreso: {order.ingreso}
              </div>
            </div>

            {/* Customer Details */}
            <div className="py-2.5 border-b border-dashed border-zinc-400 space-y-0.5">
              <div className="text-[9px] uppercase font-bold text-zinc-500">
                DATOS DEL CLIENTE
              </div>
              <div className="flex justify-between">
                <span>Cliente:</span>
                <span className="font-bold truncate max-w-[190px]">{order.cliente.nombre}</span>
              </div>
              <div className="flex justify-between">
                <span>Teléfono:</span>
                <span>{order.cliente.telefono}</span>
              </div>
            </div>

            {/* Device Details */}
            <div className="py-2.5 border-b border-dashed border-zinc-400 space-y-0.5">
              <div className="text-[9px] uppercase font-bold text-zinc-500">
                DATOS DEL DISPOSITIVO
              </div>
              <div className="flex justify-between">
                <span>Equipo:</span>
                <span className="font-bold">{order.dispositivo.marca} {order.dispositivo.modelo}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span>IMEI/Serie:</span>
                <span className="font-semibold">{order.dispositivo.imei}</span>
              </div>
              <div className="flex justify-between">
                <span>Clave/PIN:</span>
                <span className="font-bold">{order.dispositivo.claveBloqueo || 'Sin clave'}</span>
              </div>
              <div className="flex justify-between">
                <span>Técnico:</span>
                <span>{order.tecnico?.nombre || 'Por asignar'}</span>
              </div>
            </div>

            {/* Declared Issue & Checklist */}
            <div className="py-2.5 border-b border-dashed border-zinc-400 space-y-1">
              <div className="text-[9px] uppercase font-bold text-zinc-500">
                FALLA REPORTADA
              </div>
              <p className="text-[10px] text-zinc-800 italic">
                "{order.fallaDeclarada}"
              </p>

              {order.preDiagnostico && (
                <div className="pt-0.5">
                  <span className="text-[9px] uppercase font-bold text-zinc-600 block">
                    PRE-DIAGNÓSTICO TÉCNICO:
                  </span>
                  <p className="text-[9.5px] text-zinc-800">
                    {order.preDiagnostico}
                  </p>
                </div>
              )}

              <div className="text-[9px] uppercase font-bold text-zinc-500 pt-1">
                CHECKLIST RECEPCIÓN:
              </div>
              {order.checklist.equipoApagado ? (
                <div className="text-[9.5px] font-bold text-zinc-800 bg-zinc-100 p-1 rounded text-center">
                  [!] EQUIPO APAGADO / NO ENCIENDE (Pruebas de funciones pendientes de diagnóstico)
                </div>
              ) : (
                <div className="grid grid-cols-2 text-[9px] text-zinc-700">
                  <span>Display: {order.checklist.cristales ? '✓ OK' : '✗ Roto'}</span>
                  <span>Carga: {order.checklist.carga ? '✓ OK' : '✗ Falla'}</span>
                  <span>Cámaras: {order.checklist.camaras ? '✓ OK' : '✗ Falla'}</span>
                  <span>Audio: {order.checklist.audio ? '✓ OK' : '✗ Falla'}</span>
                </div>
              )}
            </div>

            {/* Financial summary */}
            <div className="py-2.5 border-b border-dashed border-zinc-400 space-y-1 text-right">
              <div className="flex justify-between text-[10px]">
                <span>Mano de obra:</span>
                <span>${order.costoManoObra}</span>
              </div>
              {totalPiezas > 0 && (
                <div className="flex justify-between text-[10px]">
                  <span>Refacciones:</span>
                  <span>${totalPiezas}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-xs pt-1 border-t border-zinc-300">
                <span>TOTAL ESTIMADO:</span>
                <span>${totalCobro.toLocaleString()} MXN</span>
              </div>
            </div>

            {/* Legal terms & Signature */}
            <div className="pt-3 text-[8px] text-zinc-600 space-y-3 leading-tight text-center">
              <p>{config.politicaGarantiaTexto}</p>
              <p className="font-semibold text-zinc-800">
                Garantía: {order.garantiaDias} días contra defectos de instalación.
              </p>
              <div className="pt-6 border-t border-zinc-800 mt-6 text-center">
                <span className="text-[9px] text-zinc-800 font-bold block">
                  FIRMA DE CONFORMIDAD DEL CLIENTE
                </span>
                <span className="text-[8px] text-zinc-500">
                  Acepto los términos y estado de recepción del equipo.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="p-4 border-t border-zinc-800 bg-[#111114] flex items-center justify-between">
          <button
            onClick={handleCopyText}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1c1c20] hover:bg-zinc-800 text-zinc-300 border border-zinc-700/60 text-xs transition-colors font-mono"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? '¡Copiado!' : 'Copiar Texto'}</span>
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-[#1c1c20] hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 text-xs transition-colors"
            >
              Cerrar
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs shadow transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Ticket (ESC/POS)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
