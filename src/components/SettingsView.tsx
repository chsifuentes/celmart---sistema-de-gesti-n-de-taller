import React, { useState } from 'react';
import { 
  Building2, 
  Printer, 
  ShieldAlert, 
  Save, 
  Check, 
  DollarSign, 
  Wifi, 
  Bluetooth, 
  Usb,
  Sparkles
} from 'lucide-react';
import { WorkshopConfig } from '../types';

interface SettingsViewProps {
  config: WorkshopConfig;
  onSaveConfig: (updated: WorkshopConfig) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ config, onSaveConfig }) => {
  const [formData, setFormData] = useState<WorkshopConfig>(config);
  const [isSaved, setIsSaved] = useState(false);
  const [testingPrinter, setTestingPrinter] = useState(false);
  const [printerSuccess, setPrinterSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig(formData);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">Configuración del Sistema</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Parámetros operativos de la sucursal CelMart, hardware de impresión térmica y garantías.
          </p>
        </div>

        {isSaved && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-900/50 text-xs font-mono">
            <Check className="w-3.5 h-3.5" />
            Configuración guardada
          </span>
        )}
      </div>

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

          <div className="pt-2 flex items-center justify-between">
            <p className="text-[11px] text-zinc-400">
              Prueba la conexión directa con el cortador de papel y la fuente ESC/POS.
            </p>
            <button
              type="button"
              onClick={handleTestPrinter}
              disabled={testingPrinter}
              className="px-3.5 py-1.5 rounded-lg bg-[#1c1c20] hover:bg-zinc-800 text-zinc-200 border border-zinc-700/60 text-xs font-mono transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              {testingPrinter ? 'Enviando pulso...' : printerSuccess ? '¡Conexión Exitosa!' : 'Test de Impresión'}
            </button>
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

        {/* Save button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            id="btn-save-settings"
            className="flex items-center gap-2 bg-zinc-100 hover:bg-white text-zinc-950 px-6 py-2.5 rounded-lg font-semibold text-xs shadow-md transition-all"
          >
            <Save className="w-4 h-4" />
            <span>Guardar Configuración CelMart</span>
          </button>
        </div>
      </form>
    </div>
  );
};
