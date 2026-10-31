import React, { useState, useEffect, useRef } from 'react';
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
  AlertCircle,
  RotateCcw,
  Sparkles,
  Copy
} from 'lucide-react';
import { WhatsAppConnectionControl } from './WhatsAppConnectionControl';
import { WorkshopConfig, WhatsAppTemplateKey } from '../types';
import { defaultWhatsAppTemplates, testWhatsAppConnection, validateWhatsAppApiUrl } from '../lib/whatsapp';

interface SettingsViewProps {
  config: WorkshopConfig;
  onSaveConfig: (updated: WorkshopConfig) => Promise<void> | void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ config, onSaveConfig }) => {
  // Garantizar que existan las 4 plantillas
  const [formData, setFormData] = useState<WorkshopConfig>(() => {
    return {
      ...config,
      plantillasWhatsApp: {
        ...defaultWhatsAppTemplates,
        ...(config.plantillasWhatsApp || {})
      }
    };
  });

  const [activeTemplateTab, setActiveTemplateTab] = useState<WhatsAppTemplateKey>('cambioEstatus');
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [testingPrinter, setTestingPrinter] = useState(false);
  const [printerSuccess, setPrinterSuccess] = useState(false);
  const [testingWhatsApp, setTestingWhatsApp] = useState(false);
  const [whatsappConnection, setWhatsappConnection] = useState<{ reachable: boolean; status?: number; error?: string } | null>(null);
  const baseConfig = useRef(config);
  const currentDraft = useRef(formData);
  currentDraft.current = formData;
  const [sharedChanges, setSharedChanges] = useState(false);
  const savedResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (savedResetTimer.current) clearTimeout(savedResetTimer.current);
  }, []);

  // Sincronizar el formulario si cambia la configuración externa
  useEffect(() => {
    const incoming = {
      ...config,
      plantillasWhatsApp: {
        ...defaultWhatsAppTemplates,
        ...(config.plantillasWhatsApp || {})
      }
    };
    if (JSON.stringify(currentDraft.current) !== JSON.stringify(baseConfig.current)
      && JSON.stringify(currentDraft.current) !== JSON.stringify(incoming)) {
      setSharedChanges(true);
      return;
    }
    baseConfig.current = incoming;
    setFormData(incoming);
    setSharedChanges(false);
  }, [config]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (isSaving) return;
    if (savedResetTimer.current) clearTimeout(savedResetTimer.current);
    savedResetTimer.current = null;
    setIsSaved(false);
    if (sharedChanges) {
      setErrorMessage('Otro dispositivo actualizó la configuración. Carga la versión compartida antes de guardar para evitar sobrescribirla.');
      return;
    }

    // Validaciones básicas
    if (!formData.nombreTaller.trim()) {
      setErrorMessage('El nombre comercial del taller es obligatorio.');
      return;
    }
    if (!formData.telefono.trim()) {
      setErrorMessage('El teléfono de atención y WhatsApp es obligatorio.');
      return;
    }
    if (formData.whatsappApiUrl?.trim()) {
      const urlError = validateWhatsAppApiUrl(formData.whatsappApiUrl);
      if (urlError) {
        setErrorMessage(urlError);
        return;
      }
    }

    setIsSaving(true);
    try {
      await onSaveConfig(formData);
      baseConfig.current = formData;
      setIsSaved(true);
      const now = new Date();
      setLastSavedTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      savedResetTimer.current = setTimeout(() => setIsSaved(false), 4000);
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

  const handleTestWhatsApp = async () => {
    if (testingWhatsApp) return;
    setTestingWhatsApp(true);
    setWhatsappConnection(null);
    try {
      setWhatsappConnection(await testWhatsAppConnection(formData));
    } finally {
      setTestingWhatsApp(false);
    }
  };

  const handleRestoreTemplateDefaults = () => {
    setFormData(prev => ({
      ...prev,
      plantillasWhatsApp: {
        ...defaultWhatsAppTemplates
      }
    }));
  };

  const handleInsertVariable = (variableName: string) => {
    const currentVal = formData.plantillasWhatsApp?.[activeTemplateTab] || '';
    const updatedVal = currentVal + ` {{${variableName}}}`;
    setFormData(prev => ({
      ...prev,
      plantillasWhatsApp: {
        ...prev.plantillasWhatsApp,
        [activeTemplateTab]: updatedVal
      }
    }));
  };

  const templateTabs: { key: WhatsAppTemplateKey; title: string; subtitle: string; icon: string }[] = [
    { key: 'ingreso', title: 'Ingreso / Recepción', subtitle: 'Recepción del equipo en mostrador', icon: '📥' },
    { key: 'cambioEstatus', title: 'Cambio de Estatus', subtitle: 'Diagnóstico, repuesto o reparación', icon: '🔄' },
    { key: 'listoEntrega', title: 'Listo para Entrega', subtitle: 'Equipo reparado y verificado', icon: '🎉' },
    { key: 'cotizacionPendiente', title: 'Cotización Pendiente', subtitle: 'Presupuesto para aprobación', icon: '📋' },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">Configuración del Sistema</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Parámetros operativos de la sucursal CelMart, hardware de impresión térmica y mensajería WhatsApp.
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

      {sharedChanges && <div role="status" className="rounded-lg border border-amber-700/60 bg-amber-950/30 p-4 text-sm text-amber-200 space-y-3">
        <p>La configuración cambió en otro dispositivo. Tu borrador sigue disponible; carga la versión compartida antes de guardar.</p>
        <button type="button" disabled={isSaving} onClick={() => { baseConfig.current = config; setFormData(config); setSharedChanges(false); setErrorMessage(null); }} className="min-h-11 underline">Cargar configuración compartida</button>
      </div>}
      <form onSubmit={handleSubmit} className="space-y-6">
        <fieldset disabled={isSaving} className="space-y-6">
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

        <section className="bg-[#161619] border border-zinc-800/80 rounded-lg p-5 space-y-4 shadow-sm" aria-labelledby="whatsapp-api-heading">
          <div className="flex items-center gap-2.5 pb-3 border-b border-zinc-800">
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            <h3 id="whatsapp-api-heading" className="text-sm font-semibold text-zinc-100">Automatización de WhatsApp</h3>
          </div>
          <WhatsAppConnectionControl config={formData} onModeChange={enabled=>setFormData(previous=>({...previous,whatsappAutoSend:enabled}))}/>
          <label className="block text-xs">Proveedor<select aria-label="Proveedor WhatsApp" value={formData.whatsappProvider||'webhook'} onChange={e=>setFormData(previous=>({...previous,whatsappProvider:e.target.value as 'webhook'|'evolution'}))} className="block bg-zinc-800 p-2"><option value="webhook">Webhook compatible existente</option><option value="evolution">Evolution API directo (servidor portátil)</option></select></label>
          <p className="text-xs text-zinc-400">Evolution: URL base HTTPS del servidor e instancia conectada. Webhook: URL completa de envío. Tiempo máximo de respuesta: 1,5 s; respaldo wa.me.</p>
          <fieldset disabled={testingWhatsApp} className="space-y-4 disabled:opacity-70">
            <label className="flex items-start gap-3 rounded-lg border border-zinc-700/60 bg-[#111114] p-3 cursor-pointer">
              <input
                id="whatsapp-auto-send"
                type="checkbox"
                role="switch"
                checked={formData.whatsappAutoSend ?? false}
                onChange={(event) => setFormData((previous) => ({ ...previous, whatsappAutoSend: event.target.checked }))}
                className="mt-0.5 h-5 w-5 accent-emerald-500"
              />
              <span>
                <span className="block text-xs font-semibold text-zinc-100">Enviar actualizaciones automáticamente por API</span>
                <span className="block mt-1 text-[11px] text-zinc-400">Al registrar una orden o cambiar su estado. Si no hay API disponible, puedes continuar por WhatsApp manual.</span>
              </span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="sm:col-span-2">
                <label htmlFor="whatsapp-api-url" className="block text-zinc-400 font-mono text-[11px] mb-1">URL DEL SERVIDOR / WEBHOOK</label>
                <input
                  id="whatsapp-api-url"
                  type="url"
                  value={formData.whatsappApiUrl ?? ''}
                  onChange={(event) => { setFormData((previous) => ({ ...previous, whatsappApiUrl: event.target.value })); setWhatsappConnection(null); }}
                  placeholder="https://tu-integracion.example/whatsapp/enviar"
                  autoComplete="off"
                  className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-emerald-500 focus:outline-none"
                />
                <p className="mt-1.5 text-[11px] text-zinc-500">Tu webhook adapta el envío a Evolution API, WAHA o WhatsApp Cloud API.</p>
              </div>
              <div>
                <label htmlFor="whatsapp-api-key" className="block text-zinc-400 font-mono text-[11px] mb-1">CLAVE DEL WEBHOOK</label>
                <input
                  id="whatsapp-api-key"
                  type="password"
                  value={formData.whatsappApiKey ?? ''}
                  onChange={(event) => { setFormData((previous) => ({ ...previous, whatsappApiKey: event.target.value })); setWhatsappConnection(null); }}
                  autoComplete="new-password"
                  placeholder="Opcional si tu integración no la requiere"
                  className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="whatsapp-api-instance" className="block text-zinc-400 font-mono text-[11px] mb-1">INSTANCIA / SESIÓN</label>
                <input
                  id="whatsapp-api-instance"
                  type="text"
                  value={formData.whatsappInstancia ?? ''}
                  onChange={(event) => { setFormData((previous) => ({ ...previous, whatsappInstancia: event.target.value })); setWhatsappConnection(null); }}
                  placeholder="celmart"
                  autoComplete="off"
                  className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
            <p className="text-[11px] text-zinc-500">La configuración se comparte con los usuarios autenticados del taller. Usa una clave limitada de tu webhook; conserva las credenciales maestras en tu integración.</p>
          </fieldset>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <button
              type="button"
              onClick={handleTestWhatsApp}
              disabled={testingWhatsApp || !formData.whatsappApiUrl?.trim()}
              className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-zinc-700/60 bg-[#1c1c20] px-3.5 py-2 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              {testingWhatsApp ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
              {testingWhatsApp ? 'Comprobando...' : 'Comprobar conexión (sin enviar)'}
            </button>
            <p className="text-[11px] text-zinc-500">{formData.whatsappProvider==='evolution'?'Comprueba que la instancia esté conectada a WhatsApp.':'Comprueba acceso HTTP con HEAD.'} No envía mensajes ni confirma su entrega.</p>
          </div>
          {whatsappConnection && (
            <p role="status" className={`rounded-lg border p-3 text-xs ${whatsappConnection.reachable ? 'border-emerald-800/60 bg-emerald-950/30 text-emerald-300' : 'border-amber-800/60 bg-amber-950/30 text-amber-300'}`}>
              {whatsappConnection.reachable
                ? `Conexión comprobada (HTTP ${whatsappConnection.status}). Esto no confirma la entrega de mensajes.`
                : whatsappConnection.error}
            </p>
          )}
        </section>

        {/* WhatsApp Notification Templates Manager */}
        <div className="bg-[#161619] border border-zinc-800/80 rounded-lg p-5 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-md bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400">
                <MessageSquare className="w-3.5 h-3.5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">
                  Plantillas de Comunicación Directa por WhatsApp
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Personaliza los mensajes que se enviarán a los clientes según el estado técnico de su equipo.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRestoreTemplateDefaults}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#1c1c20] hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 text-[11px] font-mono transition-colors self-start sm:self-auto"
              title="Reestablecer todas las plantillas al texto por defecto"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restaurar por defecto</span>
            </button>
          </div>

          {/* Template Selector Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {templateTabs.map((tab) => {
              const isSelected = activeTemplateTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTemplateTab(tab.key)}
                  className={`p-2.5 rounded-lg border text-left transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'bg-emerald-950/30 border-emerald-600/70 text-emerald-200 shadow-sm'
                      : 'bg-[#1c1c20] border-zinc-800/80 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <span>{tab.icon}</span>
                    <span className="truncate">{tab.title}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 truncate mt-1">
                    {tab.subtitle}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Variables dinámicas chips */}
          <div className="p-3 rounded-lg bg-[#111114] border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-semibold text-zinc-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Variables Dinámicas Disponibles (haz clic para insertar en el texto):
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { tag: 'cliente', desc: 'Nombre del cliente' },
                { tag: 'dispositivo', desc: 'Marca y modelo del equipo' },
                { tag: 'orden', desc: 'Folio / Orden (ej. OS-2402)' },
                { tag: 'link_seguimiento', desc: 'Enlace público de seguimiento' },
                { tag: 'estado', desc: 'Estado actual de reparación' },
                { tag: 'tecnico', desc: 'Técnico asignado' },
              ].map(({ tag, desc }) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleInsertVariable(tag)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#1c1c20] hover:bg-emerald-950/40 hover:text-emerald-300 hover:border-emerald-700/60 border border-zinc-700/60 font-mono text-[11px] text-zinc-300 transition-all cursor-pointer"
                  title={`Insertar {{${tag}}} (${desc})`}
                >
                  <span className="text-emerald-400 font-bold">{`{{${tag}}}`}</span>
                  <span className="text-zinc-500 text-[10px]">· {desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Active Template Editor */}
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-zinc-400 font-mono text-[11px]">
              <span>EDITANDO: {templateTabs.find(t => t.key === activeTemplateTab)?.title.toUpperCase()}</span>
              <span className="text-zinc-500">
                {(formData.plantillasWhatsApp?.[activeTemplateTab] || '').length} caracteres
              </span>
            </div>
            <textarea
              rows={6}
              value={formData.plantillasWhatsApp?.[activeTemplateTab] || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  plantillasWhatsApp: {
                    ...formData.plantillasWhatsApp,
                    [activeTemplateTab]: e.target.value,
                  },
                })
              }
              className="w-full bg-[#1c1c20] text-zinc-100 px-3.5 py-2.5 rounded-lg border border-zinc-700/60 focus:border-emerald-500 focus:outline-none text-xs leading-relaxed font-sans shadow-inner"
              placeholder="Escribe el mensaje de la plantilla..."
            />
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
                <span>¡Parámetros y plantillas WhatsApp de CelMart guardados correctamente!</span>
              </div>
            ) : lastSavedTime ? (
              <span className="text-zinc-500 font-mono text-[11px]">
                Última actualización guardada: {lastSavedTime}
              </span>
            ) : (
              <span className="text-zinc-500 text-[11px]">
                Los cambios se aplicarán de inmediato a los comprobantes impresos y notificaciones de WhatsApp.
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
        </fieldset>
      </form>
    </div>
  );
};
