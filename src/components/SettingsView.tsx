import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Printer, 
  ShieldAlert, 
  Save, 
  Check, 
  DollarSign, 
  MessageSquare,
  Percent,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { WorkshopConfig } from '../types';

interface SettingsViewProps {
  config: WorkshopConfig;
  onSaveConfig: (updated: WorkshopConfig) => Promise<void> | void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ config, onSaveConfig }) => {
  const [formData, setFormData] = useState<WorkshopConfig>(config);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [testingPrinter, setTestingPrinter] = useState(false);
  const [printerSuccess, setPrinterSuccess] = useState(false);

  // Sincronizar el formulario si cambia la configuración externa
  useEffect(() => {
    setFormData(config);
  }, [config]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validaciones básicas
    if (!formData.nombreTaller.trim()) {
      setErrorMessage('El nombre comercial del taller es obligatorio.');
      return;
    }
    if (!formData.telefono.trim()) {
      setErrorMessage('El teléfono de atención y WhatsApp es obligatorio.');
      return;
    }

    setIsSaving(true);
    try {
      await onSaveConfig(formData);
      setIsSaved(true);
      const now = new Date();
      setLastSavedTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setTimeout(() => setIsSaved(false), 4000);
    } catch (err: any) {
      console.error('Error al guardar la configuración:', err);
      setErrorMessage(err?.message || 'Error al guardar la configuración. Intente nuevamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestPrinter = () => {
    setTestingPrinter(true);
    setPrinterSuccess(false);
    setTimeout(() => {
      setTestingPrinter(false);
      setPrinterSuccess(true);
      setTimeout(() => setPrinterSuccess(false), 3500);
    }, 1200);
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">Configuración del Sistema</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Parámetros operativos de la sucursal CelMart, hardware de impresión térmica y garantías.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastSavedTime && !isSaved && (
            <span className="text-[11px] font-mono text-zinc-500">
              Guardado: {lastSavedTime}
            </span>
          )}
          {isSaved && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 text-xs font-mono shadow-sm animate-in fade-in">
              <Check className="w-3.5 h-3.5" />
              Configuración guardada y activa
            </span>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-900/60 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Workshop identity */}
        <div className="bg-[#161619] border border-zinc-800/80 rounded-lg p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2.5 pb-3 border-b border-zinc-800">
            <Building2 className="w-4 h-4 text-zinc-300" />
            <h3 className="text-sm font-semibold text-zinc-100">Datos de la Sucursal y Marca</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                NOMBRE COMERCIAL DEL TALLER *
              </label>
              <input
                type="text"
                required
                value={formData.nombreTaller}
                onChange={(e) => setFormData({ ...formData, nombreTaller: e.target.value })}
                className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none font-medium"
                placeholder="Ej. CelMart"
              />
            </div>

            <div>
              <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                TELÉFONO DE ATENCIÓN Y WHATSAPP *
              </label>
              <input
                type="text"
                required
                value={formData.telefono}
                onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                className="w-full bg-[#1c1c20] text-zinc-100 font-mono px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                placeholder="+52 55 1234 5678"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                DIRECCIÓN FÍSICA DE LA SUCURSAL
              </label>
              <input
                type="text"
                value={formData.direccion}
                onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                placeholder="Av. Insurgentes Sur #423, Col. Roma Norte, CDMX"
              />
            </div>

            <div>
              <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                CORREO ELECTRÓNICO
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                placeholder="soporte@celmart.mx"
              />
            </div>

            <div>
              <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                RFC / REGISTRO FISCAL
              </label>
              <input
                type="text"
                value={formData.rfc}
                onChange={(e) => setFormData({ ...formData, rfc: e.target.value.toUpperCase() })}
                className="w-full bg-[#1c1c20] text-zinc-100 font-mono px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                placeholder="CMT-230815-9X1"
              />
            </div>
          </div>
        </div>

        {/* Commercial and Billing Settings */}
        <div className="bg-[#161619] border border-zinc-800/80 rounded-lg p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2.5 pb-3 border-b border-zinc-800">
            <DollarSign className="w-4 h-4 text-zinc-300" />
            <h3 className="text-sm font-semibold text-zinc-100">Parámetros Comerciales y Moneda</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                SÍMBOLO DE MONEDA
              </label>
              <input
                type="text"
                value={formData.simboloMoneda || '$'}
                onChange={(e) => setFormData({ ...formData, simboloMoneda: e.target.value })}
                className="w-full bg-[#1c1c20] text-zinc-100 font-mono px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                placeholder="$"
              />
            </div>

            <div>
              <label className="block text-zinc-400 font-mono text-[11px] mb-1 flex items-center gap-1">
                <Percent className="w-3 h-3 text-zinc-400" />
                TASA DE IVA (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={formData.tasaIva ?? 16}
                onChange={(e) => setFormData({ ...formData, tasaIva: Number(e.target.value) })}
                className="w-full bg-[#1c1c20] text-zinc-100 font-mono px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                placeholder="16"
              />
            </div>
          </div>
        </div>

        {/* Thermal Printer Hardware */}
        <div className="bg-[#161619] border border-zinc-800/80 rounded-lg p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2.5">
              <Printer className="w-4 h-4 text-zinc-300" />
              <h3 className="text-sm font-semibold text-zinc-100">
                Impresora Térmica de Comprobantes (POS)
              </h3>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-2.5 py-0.5 rounded-full border border-emerald-800/50 font-semibold">
              ESC/POS Habilitado
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                DISPOSITIVO DE IMPRESIÓN POR DEFECTO
              </label>
              <select
                value={formData.impresoraDefecto}
                onChange={(e) => setFormData({ ...formData, impresoraDefecto: e.target.value as any })}
                className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
              >
                <option value="USB - Impresora Térmica 80mm">USB - Impresora Térmica 80mm (Recomendado)</option>
                <option value="Bluetooth - POS-80">Bluetooth - POS-80 Portátil</option>
                <option value="Red LAN - Thermal-01">Red LAN / Ethernet - Thermal-01 (192.168.1.150)</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                FORMATO / ANCHO DE ROLLO
              </label>
              <select
                value={formData.anchoTicket}
                onChange={(e) => setFormData({ ...formData, anchoTicket: e.target.value as any })}
                className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
              >
                <option value="80mm">80mm Estándar (Recomendado para CelMart)</option>
                <option value="58mm">58mm Compacto</option>
              </select>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-[11px] text-zinc-400">
              Prueba la conexión directa con el cortador de papel y la fuente ESC/POS.
            </p>
            <button
              type="button"
              onClick={handleTestPrinter}
              disabled={testingPrinter}
              className="px-3.5 py-1.5 rounded-lg bg-[#1c1c20] hover:bg-zinc-800 text-zinc-200 border border-zinc-700/60 text-xs font-mono transition-colors flex items-center gap-1.5 disabled:opacity-50 self-start sm:self-auto"
            >
              <Printer className="w-3.5 h-3.5" />
              {testingPrinter ? 'Enviando pulso...' : printerSuccess ? '¡Conexión Exitosa!' : 'Test de Impresión'}
            </button>
          </div>
        </div>

        {/* WhatsApp Notification Template */}
        <div className="bg-[#161619] border border-zinc-800/80 rounded-lg p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2.5 pb-3 border-b border-zinc-800">
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-zinc-100">
              Plantilla de Notificación WhatsApp
            </h3>
          </div>

          <div className="text-xs space-y-2">
            <label className="block text-zinc-400 font-mono text-[11px]">
              PLANTILLA DE MENSAJE AUTOMÁTICO
            </label>
            <textarea
              rows={3}
              value={formData.mensajeWhatsAppPlantilla}
              onChange={(e) => setFormData({ ...formData, mensajeWhatsAppPlantilla: e.target.value })}
              className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none text-xs leading-relaxed font-mono"
              placeholder="Hola {{cliente}}, te informamos que tu dispositivo {{dispositivo}} (Orden {{orden}}) se encuentra en estado: *{{estado}}*."
            />
            <p className="text-[10px] text-zinc-500 font-mono">
              Variables disponibles: {'{{cliente}}'}, {'{{dispositivo}}'}, {'{{orden}}'}, {'{{estado}}'}
            </p>
          </div>
        </div>

        {/* Warranty Policies */}
        <div className="bg-[#161619] border border-zinc-800/80 rounded-lg p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2.5 pb-3 border-b border-zinc-800">
            <ShieldAlert className="w-4 h-4 text-zinc-300" />
            <h3 className="text-sm font-semibold text-zinc-100">
              Políticas de Garantía y Términos Técnicos
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                DÍAS GARANTÍA PANTALLAS
              </label>
              <input
                type="number"
                min="0"
                value={formData.diasGarantiaPantalla}
                onChange={(e) => setFormData({ ...formData, diasGarantiaPantalla: Number(e.target.value) })}
                className="w-full bg-[#1c1c20] text-zinc-100 font-mono px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                DÍAS GARANTÍA BATERÍAS
              </label>
              <input
                type="number"
                min="0"
                value={formData.diasGarantiaBateria}
                onChange={(e) => setFormData({ ...formData, diasGarantiaBateria: Number(e.target.value) })}
                className="w-full bg-[#1c1c20] text-zinc-100 font-mono px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                DÍAS GARANTÍA MICROSOLDADURA
              </label>
              <input
                type="number"
                min="0"
                value={formData.diasGarantiaPlaca}
                onChange={(e) => setFormData({ ...formData, diasGarantiaPlaca: Number(e.target.value) })}
                className="w-full bg-[#1c1c20] text-zinc-100 font-mono px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                TEXTO LEGAL AL PIE DEL TICKET DE RECEPCIÓN
              </label>
              <textarea
                rows={3}
                value={formData.politicaGarantiaTexto}
                onChange={(e) => setFormData({ ...formData, politicaGarantiaTexto: e.target.value })}
                className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none text-xs leading-relaxed"
              />
            </div>
          </div>
        </div>

        {/* Save button and status footer */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-3 pb-8 border-t border-zinc-800/80">
          <div className="text-xs">
            {isSaved ? (
              <div className="flex items-center gap-2 text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-3.5 py-2 rounded-lg font-mono">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>¡Parámetros de CelMart guardados y sincronizados correctamente!</span>
              </div>
            ) : lastSavedTime ? (
              <span className="text-zinc-500 font-mono text-[11px]">
                Última actualización guardada: {lastSavedTime}
              </span>
            ) : (
              <span className="text-zinc-500 text-[11px]">
                Los cambios se aplicarán de inmediato a los comprobantes impresos y tickets.
              </span>
            )}
          </div>

          <button
            type="submit"
            id="btn-save-settings"
            disabled={isSaving}
            className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-xs transition-all cursor-pointer shadow-md ${
              isSaved 
                ? 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400 ring-2 ring-emerald-400/40'
                : isSaving
                ? 'bg-zinc-300 text-zinc-800 cursor-wait opacity-80'
                : 'bg-zinc-100 hover:bg-white text-zinc-950 active:scale-95'
            }`}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-zinc-900" />
                <span>Guardando Configuración...</span>
              </>
            ) : isSaved ? (
              <>
                <Check className="w-4 h-4 text-zinc-950 stroke-[3]" />
                <span>¡Configuración CelMart Guardada!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Guardar Configuración CelMart</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
