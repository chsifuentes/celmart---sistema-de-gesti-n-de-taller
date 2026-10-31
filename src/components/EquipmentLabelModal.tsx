import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { Order, WorkshopConfig } from '../types';
import { getTrackingUrl } from '../lib/trackingUrl';
export function EquipmentLabelModal({
  order,
  config,
  onClose,
}: {
  order: Order | null;
  config: WorkshopConfig;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<'50x30' | '58mm'>('50x30');
  if (!order) return null;
  const compact = format === '50x30';
  const date =
    order.fechaIngreso && Number.isFinite(Date.parse(order.fechaIngreso))
      ? new Date(order.fechaIngreso).toLocaleDateString('es-MX')
      : order.ingreso;
  const unlock = order.dispositivo.patronPuntos?.length
    ? order.dispositivo.patronPuntos.join('→')
    : order.dispositivo.claveBloqueo || 'Sin registrar';
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Etiqueta de equipo"
      className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4"
    >
      <div className="max-w-lg w-full bg-zinc-900 rounded-xl p-5 space-y-4">
        <h2 className="font-bold">🏷️ Etiqueta de Equipo</h2>
        <label>
          Formato
          <select
            aria-label="Formato de etiqueta"
            value={format}
            onChange={(e) => setFormat(e.target.value as '50x30' | '58mm')}
            className="bg-zinc-800 p-2 ml-3 rounded"
          >
            <option value="50x30">50 × 30 mm</option>
            <option value="58mm">58 mm</option>
          </select>
        </label>
        <div className="bg-zinc-700 overflow-auto p-4 flex justify-center">
          <div
            id="equipment-label"
            style={{
              width: compact ? '50mm' : '58mm',
              height: compact ? '30mm' : 'auto',
              boxSizing: 'border-box',
              padding: '1.5mm',
              background: 'white',
              color: 'black',
              fontFamily: 'monospace',
              fontSize: compact ? '7px' : '10px',
              lineHeight: 1.15,
              overflow: compact ? 'hidden' : 'visible',
            }}
          >
            <div
              style={{ display: 'flex', gap: '1mm', alignItems: 'flex-start' }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  CM · {config.nombreTaller}
                </div>
                <strong
                  style={{
                    display: 'block',
                    fontSize: compact ? '13px' : '16px',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {order.id}
                </strong>
                <div>{date}</div>
                <div style={{ marginTop: '1mm', overflowWrap: 'anywhere' }}>
                  Modelo: {order.dispositivo.modelo}
                </div>
                <div style={{ overflowWrap: 'anywhere' }}>
                  Cliente: {order.cliente.nombre}
                </div>
              </div>
              <QRCodeSVG
                value={getTrackingUrl(order.id)}
                level="M"
                marginSize={4}
                size={90}
                style={{
                  width: compact ? '19mm' : '23mm',
                  height: compact ? '19mm' : '23mm',
                  flexShrink: 0,
                }}
                title={`Seguimiento ${order.id}`}
              />
            </div>
            <div style={{ marginTop: '1mm', overflowWrap: 'anywhere' }}>
              Ubicación: {order.ubicacionFisica || 'Sin asignar'}
            </div>
            <div style={{ overflowWrap: 'anywhere' }}>PIN/Patrón: {unlock}</div>
          </div>
        </div>
        <p className="text-xs text-zinc-400">
          Vista a tamaño real. Para campos largos utiliza 58 mm. Revisa la
          escala 100 % y el papel en el diálogo de impresión.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => window.print()}
            className="min-h-11 bg-teal-400 text-black rounded px-4"
          >
            Imprimir etiqueta
          </button>
          <button
            onClick={onClose}
            className="min-h-11 px-4 rounded border border-zinc-700"
          >
            Cerrar
          </button>
        </div>
        <style>{`@media print{body *{visibility:hidden!important}body,#root{margin:0!important;height:0!important;overflow:visible!important}#equipment-label,#equipment-label *{visibility:visible!important}#equipment-label{position:fixed!important;top:0;left:0;box-shadow:none!important}@page{size:${compact ? '50mm 30mm' : 'auto'};margin:0}}`}</style>
      </div>
    </div>
  );
}
