import React, { useCallback, useEffect, useRef, useState } from 'react';
import { 
  X, 
  ChevronRight, 
  ChevronLeft, 
  User, 
  Smartphone, 
  ClipboardCheck, 
  Search, 
  Plus, 
  Lock, 
  Grid3X3, 
  Wrench,
  CheckCircle2,
  AlertCircle,
  Hash,
  Camera,
  ImagePlus,
  Loader2
} from 'lucide-react';
import { Order, Client, Technician, ReceptionChecklist, DeviceCategory, CHECKLIST_BY_CATEGORY } from '../types';
import { uploadWorkshopPhoto } from '../lib/imageStorage';

const DEVICE_CATEGORIES = Object.keys(CHECKLIST_BY_CATEGORY) as DeviceCategory[];
const initialChecklist = (): ReceptionChecklist =>
  Object.fromEntries(CHECKLIST_BY_CATEGORY.Smartphone.map(({ key }) => [key, true]));

interface NewOrderWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveOrder: (newOrder: Order, printNow: boolean) => Promise<boolean | void> | boolean | void;
  existingClients: Client[];
  technicians: Technician[];
  nextOrderNumber: number;
  initialPhoto?: File | null;
  expressReception?: boolean;
}

export const NewOrderWizardModal: React.FC<NewOrderWizardModalProps> = ({
  isOpen,
  onClose,
  onSaveOrder,
  existingClients,
  technicians,
  nextOrderNumber,
  initialPhoto = null,
  expressReception = false,
}) => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Step 1: Customer Data
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');

  // Step 2: Device Data
  const [categoria, setCategoria] = useState<DeviceCategory>('Smartphone');
  const [marca, setMarca] = useState('Apple');
  const [modelo, setModelo] = useState('');
  const [imei, setImei] = useState('');
  const [color, setColor] = useState('');
  const [lockType, setLockType] = useState<'PIN' | 'Patrón' | 'Ninguno'>('PIN');
  const [lockPin, setLockPin] = useState('');
  const [patternDots, setPatternDots] = useState<number[]>([]);

  // Step 3: Reception Checklist & Fault
  const [equipoApagado, setEquipoApagado] = useState(false);
  const [checklist, setChecklist] = useState<ReceptionChecklist>(initialChecklist);
  const [fotosEvidencia, setFotosEvidencia] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const uploadInProgress = useRef(false);
  const processedInitialPhoto = useRef<File | null>(null);
  const formIsOpen = useRef(false);
  const saveInProgress = useRef(false);
  const [fallaDeclarada, setFallaDeclarada] = useState('');
  const [preDiagnostico, setPreDiagnostico] = useState('');
  const [observacionesFisicas, setObservacionesFisicas] = useState('');
  const [assignedTechId, setAssignedTechId] = useState<string>('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [presupuestoEstimado, setPresupuestoEstimado] = useState(850);
  const [printImmediate, setPrintImmediate] = useState(!expressReception);

  const uploadPhotos = useCallback(async (files: File[]) => {
    if (!files.length || uploadInProgress.current || saveInProgress.current) return;
    uploadInProgress.current = true;
    setIsUploading(true);
    setPhotoError('');
    const failures: string[] = [];
    try {
      // Process one photograph at a time to limit memory usage on mobile devices.
      for (const file of files) {
        try {
          const photoUrl = await uploadWorkshopPhoto(file, 'ordenes', `recepcion-${nextOrderNumber}`);
          if (!photoUrl) throw new Error('No se pudo guardar la imagen.');
          setFotosEvidencia((prev) => [...prev, photoUrl]);
        } catch {
          failures.push(file.name);
        }
      }
      if (failures.length) {
        setPhotoError(`No se pudieron subir: ${failures.join(', ')}. Inténtalo de nuevo.`);
      }
    } finally {
      uploadInProgress.current = false;
      setIsUploading(false);
    }
  }, [nextOrderNumber]);

  useEffect(() => {
    if (!isOpen) {
      formIsOpen.current = false;
      return;
    }
    if (formIsOpen.current) return;
    formIsOpen.current = true;
    setCurrentStep(1);
    setClientSearch('');
    setSelectedClientId(null);
    setClientName('');
    setClientPhone('');
    setClientEmail('');
    setCategoria('Smartphone');
    setMarca('Apple');
    setModelo('');
    setImei('');
    setColor('');
    setLockType('PIN');
    setLockPin('');
    setPatternDots([]);
    setEquipoApagado(false);
    setChecklist(initialChecklist());
    setFotosEvidencia([]);
    setPhotoError('');
    setSaveError('');
    setFallaDeclarada('');
    setPreDiagnostico('');
    setObservacionesFisicas('');
    setAssignedTechId('');
    setIsUrgent(false);
    setPresupuestoEstimado(850);
    setPrintImmediate(!expressReception);
  }, [isOpen, expressReception]);

  useEffect(() => {
    if (!isOpen) {
      processedInitialPhoto.current = null;
      return;
    }
    if (!initialPhoto || processedInitialPhoto.current === initialPhoto || uploadInProgress.current || saveInProgress.current) return;
    // Mark the File before starting async work; StrictMode must not upload it twice.
    processedInitialPhoto.current = initialPhoto;
    void uploadPhotos([initialPhoto]);
  }, [isOpen, initialPhoto, uploadPhotos, isUploading, isSaving]);

  if (!isOpen) return null;

  // Filter clients for quick pick
  const filteredClients = clientSearch
    ? existingClients.filter(
        (c) =>
          c.nombre.toLowerCase().includes(clientSearch.toLowerCase()) ||
          c.telefono.includes(clientSearch)
      )
    : [];

  const handleSelectExistingClient = (c: Client) => {
    setSelectedClientId(c.id);
    setClientName(c.nombre);
    setClientPhone(c.telefono);
    setClientEmail(c.email);
    setClientSearch('');
  };

  // Pattern dot click handler
  const handleTogglePatternDot = (dotIndex: number) => {
    if (patternDots.includes(dotIndex)) {
      setPatternDots(patternDots.filter((d) => d !== dotIndex));
    } else {
      setPatternDots([...patternDots, dotIndex]);
    }
  };

  const handleToggleChecklist = (key: string) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCategoryChange = (nextCategory: DeviceCategory) => {
    setCategoria(nextCategory);
    setChecklist((prev) => ({
      ...Object.fromEntries(CHECKLIST_BY_CATEGORY[nextCategory].map(({ key }) => [key, true])),
      ...prev,
    }));
  };

  const handlePhotoSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(event.target.files ?? []);
    event.target.value = '';
    void uploadPhotos(files);
  };

  const handleFinalSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (uploadInProgress.current || saveInProgress.current) return;
    saveInProgress.current = true;
    setIsSaving(true);
    setSaveError('');

    const selectedTech = technicians.find((t) => t.id === assignedTechId);
    const now = new Date();
    const formattedDate = `${now.getDate()} ${now.toLocaleDateString('es-MX', { month: 'short' })} · ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const newOrder: Order = {
      id: `OS-${nextOrderNumber}`,
      prioridadUrgente: isUrgent,
      cliente: {
        nombre: clientName.trim() || 'Cliente Mostrador',
        telefono: clientPhone.trim() || '+52 55 0000 0000',
        email: clientEmail.trim() || undefined,
      },
      dispositivo: {
        categoria,
        marca,
        modelo: modelo.trim() || `${marca} Desconocido`,
        imei: imei.trim() || 'SIN-IMEI-REGISTRADO',
        color: color.trim() || 'Negro',
        tipoBloqueo: lockType,
        claveBloqueo: lockType === 'PIN' ? lockPin : lockType === 'Patrón' ? `Patrón [${patternDots.join('→')}]` : 'Sin contraseña',
        patronPuntos: lockType === 'Patrón' ? patternDots : undefined,
      },
      estado: 'Recibido',
      tecnico: selectedTech
        ? {
            nombre: selectedTech.nombre,
            iniciales: selectedTech.iniciales,
          }
        : null,
      ingreso: formattedDate,
      fallaDeclarada: fallaDeclarada.trim() || 'Revisión general y diagnóstico técnico.',
      preDiagnostico: preDiagnostico.trim() || undefined,
      observacionesFisicas: observacionesFisicas.trim() || 'Equipo recibido sin daños cosméticos graves adicionales.',
      checklist: {
        ...Object.fromEntries(CHECKLIST_BY_CATEGORY[categoria].map(({ key }) => [key, equipoApagado ? undefined : checklist[key]])),
        equipoApagado,
      },
      fotosEvidencia,
      notasTecnicas: [
        {
          id: `note-${Date.now()}`,
          autor: 'Recepción',
          fecha: formattedDate,
          contenido: `Recepción inicial en mostrador.${equipoApagado ? ' [EQUIPO APAGADO / NO ENCIENDE].' : ''} Falla: ${fallaDeclarada || 'Diagnóstico preliminar'}${preDiagnostico ? ` · Pre-diagnóstico: ${preDiagnostico}` : ''}`,
          tipo: 'general',
        },
      ],
      repuestosAsignados: [],
      costoManoObra: presupuestoEstimado > 0 ? presupuestoEstimado : 500,
      totalEstimado: presupuestoEstimado > 0 ? presupuestoEstimado : 500,
      garantiaDias: 90,
    };

    try {
      const saved = await onSaveOrder(newOrder, printImmediate);
      if (saved === false) {
        setSaveError('No se pudo registrar la orden. Revisa la conexión e inténtalo de nuevo; tus datos siguen aquí.');
      } else {
        onClose();
      }
    } catch {
      setSaveError('No se pudo registrar la orden. Revisa la conexión e inténtalo de nuevo; tus datos siguen aquí.');
    } finally {
      saveInProgress.current = false;
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#161619] border border-zinc-700/80 rounded-lg w-full max-w-2xl shadow-2xl overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150 flex flex-col">
        {/* Wizard Header */}
        <div className="p-4 border-b border-zinc-800 bg-[#111114] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#1c1c20] border border-zinc-700/70 flex items-center justify-center font-mono font-bold text-xs text-zinc-100">
              OS-{nextOrderNumber}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">{expressReception ? 'Recepción exprés' : 'Nueva Orden de Servicio'}</h2>
              <p className="text-[11px] text-zinc-400 font-mono">
                Paso {currentStep} de 3 — {currentStep === 1 ? 'Cliente' : currentStep === 2 ? 'Dispositivo' : 'Checklist & Diagnóstico'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading || isSaving}
            aria-label="Cerrar nueva orden"
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded-lg transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Progress Indicators */}
        <div className="grid grid-cols-3 border-b border-zinc-800 text-[11px] font-mono select-none bg-[#111114]">
          <div
            onClick={() => !isUploading && !isSaving && setCurrentStep(1)}
            className={`py-2.5 px-3 flex items-center justify-center gap-2 cursor-pointer border-r border-zinc-800 transition-colors ${
              currentStep === 1
                ? 'bg-[#1c1c20] text-zinc-100 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-zinc-700 flex items-center justify-center text-[10px]">1</span>
            <span>Cliente</span>
          </div>

          <div
            onClick={() => !isUploading && !isSaving && clientName && setCurrentStep(2)}
            className={`py-2.5 px-3 flex items-center justify-center gap-2 cursor-pointer border-r border-zinc-800 transition-colors ${
              currentStep === 2
                ? 'bg-[#1c1c20] text-zinc-100 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-zinc-700 flex items-center justify-center text-[10px]">2</span>
            <span>Equipo</span>
          </div>

          <div
            onClick={() => !isUploading && !isSaving && clientName && modelo && setCurrentStep(3)}
            className={`py-2.5 px-3 flex items-center justify-center gap-2 cursor-pointer transition-colors ${
              currentStep === 3
                ? 'bg-[#1c1c20] text-zinc-100 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-zinc-700 flex items-center justify-center text-[10px]">3</span>
            <span>Checklist</span>
          </div>
        </div>

        {currentStep !== 3 && (isUploading || photoError || fotosEvidencia.length > 0) && (
          <div className="px-4 py-3 border-b border-zinc-800 bg-[#111114] text-xs">
            {isUploading ? (
              <p role="status" className="flex items-center gap-2 text-emerald-300">
                <Loader2 className="w-4 h-4 animate-spin" /> Comprimiendo y guardando la foto de recepción…
              </p>
            ) : fotosEvidencia.length > 0 ? (
              <div className="flex items-center gap-2 text-zinc-300">
                <img src={fotosEvidencia[0]} alt="Vista previa de recepción" className="w-9 h-9 object-cover rounded border border-zinc-700" />
                <span>{fotosEvidencia.length === 1 ? 'Foto de recepción lista' : `${fotosEvidencia.length} fotos de recepción listas`}. Se adjuntará al registrar la orden.</span>
              </div>
            ) : null}
            {photoError && (
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <p role="alert" className="text-rose-300">{photoError}</p>
                {initialPhoto && <button type="button" disabled={isUploading || isSaving} onClick={() => void uploadPhotos([initialPhoto])} className="text-zinc-200 underline underline-offset-2 disabled:opacity-40">Reintentar foto inicial</button>}
              </div>
            )}
          </div>
        )}

        {/* Wizard Step Body */}
        <div className="p-6 space-y-5 text-xs flex-1">
          {/* STEP 1: CLIENT DATA */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Quick Search existing clients */}
              <div className="relative">
                <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                  BUSCAR CLIENTE EXISTENTE (OPCIONAL)
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Escribe nombre o teléfono del cliente..."
                    className="w-full bg-[#1c1c20] text-zinc-100 pl-9 pr-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  />
                </div>

                {filteredClients.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 bg-[#1c1c20] border border-zinc-700 rounded-lg shadow-xl max-h-40 overflow-y-auto z-20 divide-y divide-zinc-800">
                    {filteredClients.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => handleSelectExistingClient(c)}
                        className="p-2.5 hover:bg-zinc-800/80 cursor-pointer flex items-center justify-between"
                      >
                        <div>
                          <p className="font-semibold text-zinc-100">{c.nombre}</p>
                          <p className="text-[11px] font-mono text-zinc-400">{c.telefono}</p>
                        </div>
                        <span className="text-[10px] font-mono bg-zinc-800 px-2 py-0.5 rounded text-zinc-300">
                          Seleccionar
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="sm:col-span-2">
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    NOMBRE COMPLETO *
                  </label>
                  <input
                    type="text"
                    required
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Ej: Gabriel Montes"
                    className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none font-medium"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    TELÉFONO / WHATSAPP *
                  </label>
                  <input
                    type="tel"
                    required
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="+52 55 1234 5678"
                    className="w-full bg-[#1c1c20] text-zinc-100 font-mono px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    CORREO ELECTRÓNICO
                  </label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="cliente@correo.com"
                    className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: DEVICE DATA */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div>
                <label htmlFor="device-category" className="block text-zinc-400 font-mono text-[11px] mb-1">
                  CATEGORÍA DEL DISPOSITIVO
                </label>
                <select
                  id="device-category"
                  value={categoria}
                  onChange={(event) => handleCategoryChange(event.target.value as DeviceCategory)}
                  className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                >
                  {DEVICE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    MARCA *
                  </label>
                  <select
                    value={marca}
                    onChange={(e) => setMarca(e.target.value)}
                    className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  >
                    <option value="Apple">Apple</option>
                    <option value="Samsung">Samsung</option>
                    <option value="Xiaomi">Xiaomi</option>
                    <option value="Motorola">Motorola</option>
                    <option value="Dell">Dell / PC</option>
                    <option value="Huawei">Huawei</option>
                    <option value="Oppo">Oppo</option>
                    <option value="Sony">Sony / PlayStation</option>
                    <option value="Microsoft">Microsoft / Xbox</option>
                    <option value="Nintendo">Nintendo</option>
                    <option value="HP">HP</option>
                    <option value="Lenovo">Lenovo</option>
                    <option value="ASUS">ASUS</option>
                    <option value="Otro">Otra marca</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    MODELO EXACTO *
                  </label>
                  <input
                    type="text"
                    required
                    value={modelo}
                    onChange={(e) => setModelo(e.target.value)}
                    placeholder="Ej: iPhone 13 Pro / Galaxy S23 Ultra"
                    className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none font-medium"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    {categoria === 'Smartphone' || categoria === 'Tablet' ? 'IMEI O NÚMERO DE SERIE' : 'NÚMERO DE SERIE / IDENTIFICADOR'}
                  </label>
                  <input
                    type="text"
                    value={imei}
                    onChange={(e) => setImei(e.target.value)}
                    placeholder={categoria === 'Smartphone' ? '354829116470021' : 'Serie o identificación de equipo / placa'}
                    className="w-full bg-[#1c1c20] text-zinc-100 font-mono px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    COLOR
                  </label>
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="Ej: Azul medianoche"
                    className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Password / Pattern Section */}
              <div className="p-4 rounded-lg bg-[#111114] border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="font-semibold text-zinc-200">Seguridad / Desbloqueo</span>
                  </div>

                  <div className="flex gap-1 font-mono text-[10px]">
                    {(['PIN', 'Patrón', 'Ninguno'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setLockType(t)}
                        className={`px-2.5 py-1 rounded-lg border transition-colors ${
                          lockType === t
                            ? 'bg-[#1c1c20] text-zinc-100 border-zinc-600 font-bold'
                            : 'bg-[#161619] text-zinc-400 border-zinc-800 hover:text-zinc-200'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {lockType === 'PIN' && (
                  <div>
                    <label className="block text-zinc-400 font-mono text-[10px] mb-1">
                      CÓDIGO PIN / CONTRASEÑA NUMÉRICA
                    </label>
                    <input
                      type="text"
                      value={lockPin}
                      onChange={(e) => setLockPin(e.target.value)}
                      placeholder="Ej: 142857"
                      className="w-full bg-[#1c1c20] text-zinc-100 font-mono px-3 py-1.5 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none text-sm tracking-wider"
                    />
                  </div>
                )}

                {lockType === 'Patrón' && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-zinc-400">
                      Toca los puntos en orden para registrar el patrón de desbloqueo:
                    </p>
                    <div className="flex items-center gap-6">
                      <div className="grid grid-cols-3 gap-2.5 p-3 rounded-lg bg-[#1c1c20] border border-zinc-700/60 w-36">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((dot) => {
                          const isSelected = patternDots.includes(dot);
                          const orderIndex = patternDots.indexOf(dot);
                          return (
                            <button
                              key={dot}
                              type="button"
                              onClick={() => handleTogglePatternDot(dot)}
                              className={`w-8 h-8 rounded-full border flex items-center justify-center font-mono text-[10px] transition-all ${
                                isSelected
                                  ? 'bg-zinc-100 text-zinc-950 border-white font-bold scale-105'
                                  : 'bg-[#161619] text-zinc-400 border-zinc-700 hover:border-zinc-500'
                              }`}
                            >
                              {isSelected ? orderIndex + 1 : ''}
                            </button>
                          );
                        })}
                      </div>
                      <div className="text-xs font-mono text-zinc-400">
                        {patternDots.length > 0 ? (
                          <div className="space-y-1">
                            <span className="text-zinc-200 font-bold">Secuencia:</span>
                            <p className="text-emerald-400">{patternDots.join(' → ')}</p>
                            <button
                              type="button"
                              onClick={() => setPatternDots([])}
                              className="text-[10px] text-zinc-400 hover:text-zinc-200 underline block"
                            >
                              Limpiar patrón
                            </button>
                          </div>
                        ) : (
                          <span className="italic text-zinc-400">Ningún punto marcado</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: CHECKLIST & FAULT */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Equipo Apagado / No Enciende Toggle Card */}
              <div 
                onClick={() => setEquipoApagado(!equipoApagado)}
                className={`p-3.5 rounded-lg border flex items-center justify-between cursor-pointer transition-all ${
                  equipoApagado
                    ? 'bg-amber-950/30 border-amber-700/80 text-amber-200 ring-1 ring-amber-600/40'
                    : 'bg-[#111114] border-zinc-800 hover:border-zinc-700 text-zinc-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono text-sm shrink-0 ${
                    equipoApagado 
                      ? 'bg-amber-900/50 text-amber-300 border border-amber-600/70' 
                      : 'bg-[#1c1c20] text-zinc-400 border border-zinc-700/60'
                  }`}>
                    ⚡
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-zinc-100">
                        Equipo apagado / No enciende
                      </span>
                      {equipoApagado && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-700/60 font-medium">
                          Sin energía
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-zinc-400 block mt-0.5">
                      (Imposible comprobar funciones en recepción — pruebas funcionales suspendidas)
                    </span>
                  </div>
                </div>

                <div className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors shrink-0 ${
                  equipoApagado ? 'bg-amber-500 justify-end' : 'bg-zinc-700 justify-start'
                }`}>
                  <div className="bg-zinc-950 w-4 h-4 rounded-full shadow-md transform transition-transform" />
                </div>
              </div>

              {/* Checklist Switches */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-zinc-400 font-mono text-[11px]">
                    CHECKLIST DE RECEPCIÓN (ESTADO FUNCIONAL)
                  </label>
                  {equipoApagado && (
                    <span className="text-[10px] font-mono text-amber-400/90 font-medium">
                      🔒 Bloqueado por equipo apagado
                    </span>
                  )}
                </div>

                <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 transition-opacity ${
                  equipoApagado ? 'opacity-40 pointer-events-none' : 'opacity-100'
                }`}>
                  {CHECKLIST_BY_CATEGORY[categoria].map(({ key, label }) => {
                    const isOk = !equipoApagado && checklist[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={equipoApagado}
                        onClick={() => handleToggleChecklist(key)}
                        aria-pressed={Boolean(isOk)}
                        className={`p-2.5 rounded-lg border text-left flex items-center justify-between transition-colors ${
                          equipoApagado
                            ? 'bg-[#1c1c20] border-zinc-800 text-zinc-500'
                            : isOk
                            ? 'bg-[#1c1c20] border-emerald-800/50 text-zinc-200 hover:border-emerald-700'
                            : 'bg-rose-950/30 border-rose-900/50 text-rose-300 hover:border-rose-700'
                        }`}
                      >
                        <span className="text-[11px] truncate pr-1">{label}</span>
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            equipoApagado
                              ? 'bg-zinc-600'
                              : isOk
                              ? 'bg-emerald-400'
                              : 'bg-rose-400'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
                {equipoApagado && (
                  <p className="text-[11px] font-mono text-amber-300/80 bg-amber-950/20 border border-amber-900/40 p-2 rounded-lg mt-2">
                    ⚠️ Checklist bloqueado: Al no encender el dispositivo, el estado de periféricos e integrados queda pendiente de diagnóstico en laboratorio técnico.
                  </p>
                )}
              </div>

              <section className="p-4 rounded-lg bg-[#111114] border border-zinc-800 space-y-3" aria-labelledby="reception-photos-title">
                <h3 id="reception-photos-title" className="font-semibold text-zinc-200 flex items-center gap-2">
                  <Camera className="w-4 h-4" /> Evidencia Fotográfica de Recepción
                </h3>
                <p className="text-[11px] text-zinc-400">Registra daños, golpes y accesorios. Las fotos se comprimen a WebP antes de subirlas.</p>
                <div className="flex flex-wrap gap-2">
                  <label className={`flex items-center gap-2 min-h-11 px-3 py-2 rounded-lg bg-zinc-800 text-zinc-100 border border-zinc-700 cursor-pointer ${isUploading || isSaving ? 'opacity-40' : 'hover:bg-zinc-700'}`}>
                    <Camera className="w-4 h-4" /> Tomar foto
                    <input type="file" accept="image/*" capture="environment" aria-label="Tomar foto de recepción" disabled={isUploading || isSaving} onChange={handlePhotoSelection} className="sr-only" />
                  </label>
                  <label className={`flex items-center gap-2 min-h-11 px-3 py-2 rounded-lg bg-zinc-800 text-zinc-100 border border-zinc-700 cursor-pointer ${isUploading || isSaving ? 'opacity-40' : 'hover:bg-zinc-700'}`}>
                    <ImagePlus className="w-4 h-4" /> Subir archivos
                    <input type="file" accept="image/*" multiple aria-label="Subir fotos de recepción" disabled={isUploading || isSaving} onChange={handlePhotoSelection} className="sr-only" />
                  </label>
                </div>
                {isUploading && <p role="status" className="flex items-center gap-2 text-emerald-300"><Loader2 className="w-4 h-4 animate-spin" /> Comprimiendo y subiendo fotos…</p>}
                {photoError && <p role="alert" className="text-rose-300">{photoError}</p>}
                {fotosEvidencia.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {fotosEvidencia.map((url, index) => (
                      <div key={url} className="relative rounded-lg overflow-hidden border border-zinc-700">
                        <img src={url} alt={`Evidencia de recepción ${index + 1}`} className="w-full aspect-square object-cover" />
                        <button type="button" disabled={isUploading || isSaving} aria-label={`Quitar foto ${index + 1}`} onClick={() => setFotosEvidencia((prev) => prev.filter((_, photoIndex) => photoIndex !== index))} className="absolute top-1 right-1 p-1.5 rounded-full bg-black/80 text-white disabled:opacity-40"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Falla declarada */}
              <div>
                <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                  FALLA DECLARADA POR EL CLIENTE *
                </label>
                <textarea
                  rows={2}
                  required
                  value={fallaDeclarada}
                  onChange={(e) => setFallaDeclarada(e.target.value)}
                  placeholder="Ej: Pantalla rota tras impacto, no da imagen pero vibra al conectar cargador..."
                  className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                />
              </div>

              {/* Pre-diagnóstico / Sospecha del Técnico */}
              <div>
                <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                  PRE-DIAGNÓSTICO / SOSPECHA DEL TÉCNICO
                </label>
                <textarea
                  rows={2}
                  value={preDiagnostico}
                  onChange={(e) => setPreDiagnostico(e.target.value)}
                  placeholder="Ej: Posible falla en pin de carga o batería, sujeto a revisión en fuente con osciloscopio..."
                  className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none placeholder-zinc-500"
                />
              </div>

              {/* Observaciones físicas */}
              <div>
                <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                  OBSERVACIONES FÍSICAS / COSMÉTICAS
                </label>
                <input
                  type="text"
                  value={observacionesFisicas}
                  onChange={(e) => setObservacionesFisicas(e.target.value)}
                  placeholder="Ej: Golpes leves en esquinas, rayones en tapa posterior..."
                  className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    ASIGNAR TÉCNICO
                  </label>
                  <select
                    value={assignedTechId}
                    onChange={(e) => setAssignedTechId(e.target.value)}
                    className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  >
                    <option value="">— Sin asignar —</option>
                    {technicians.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre} ({t.especialidad})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    PRESUPUESTO ESTIMADO ($ MXN)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={presupuestoEstimado}
                    onChange={(e) => setPresupuestoEstimado(Number(e.target.value))}
                    className="w-full bg-[#1c1c20] text-zinc-100 font-mono px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg bg-[#111114] border border-zinc-800 hover:border-zinc-700">
                    <input
                      type="checkbox"
                      checked={isUrgent}
                      onChange={(e) => setIsUrgent(e.target.checked)}
                      className="rounded accent-rose-500"
                    />
                    <span className="text-[11px] text-rose-300 font-semibold">
                      🔥 Orden Prioritaria
                    </span>
                  </label>
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={printImmediate}
                    onChange={(e) => setPrintImmediate(e.target.checked)}
                    className="rounded accent-zinc-100"
                  />
                  <span>Imprimir comprobante térmico automáticamente al guardar</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {saveError && <p role="alert" className="px-4 pb-3 text-xs text-rose-300">{saveError}</p>}

        {/* Wizard Footer Controls */}
        <div className="p-4 border-t border-zinc-800 bg-[#111114] flex items-center justify-between">
          <div>
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => (prev - 1) as any)}
                disabled={isUploading || isSaving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Anterior</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                disabled={isUploading || isSaving}
                className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>

          <div>
            {currentStep < 3 ? (
              <button
                type="button"
                onClick={() => {
                  if (currentStep === 1 && !clientName.trim()) return;
                  if (currentStep === 2 && !modelo.trim()) return;
                  setCurrentStep((prev) => (prev + 1) as any);
                }}
                disabled={isUploading || isSaving || (currentStep === 1 && !clientName.trim()) || (currentStep === 2 && !modelo.trim())}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-all disabled:opacity-40"
              >
                <span>Siguiente</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isUploading || isSaving}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs shadow-md transition-all disabled:opacity-40"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>{isSaving ? 'Guardando orden…' : 'Registrar Orden de Servicio'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
