export type OrderStatus =
  | 'Recibido'
  | 'En Diagnóstico'
  | 'Esperando Presupuesto'
  | 'Esperando Repuesto'
  | 'En Reparación'
  | 'Listo'
  | 'Entregado'
  | 'Garantía';

export type DeviceCategory =
  | 'Smartphone'
  | 'Consola'
  | 'Control / Mando'
  | 'PC / Laptop'
  | 'Tablet'
  | 'Microsoldadura / Placa';

export interface ReceptionChecklist {
  [key: string]: boolean | undefined;
  equipoApagado?: boolean;
}

// Keep the original Smartphone keys so existing reception records remain readable.
export const CHECKLIST_BY_CATEGORY: Record<DeviceCategory, { key: string; label: string }[]> = {
  Smartphone: [
    { key: 'cristales', label: 'Pantalla / Cristales' },
    { key: 'camaras', label: 'Cámaras (Del/Tras)' },
    { key: 'carga', label: 'Puerto de Carga' },
    { key: 'wifi', label: 'Wi-Fi / Red' },
    { key: 'botones', label: 'Botones / Volumen' },
    { key: 'biometria', label: 'FaceID / Huella' },
    { key: 'audio', label: 'Micrófono / Audio' },
    { key: 'chasis', label: 'Chasis sin doblar' },
  ],
  Consola: [
    { key: 'hdmi', label: 'Puerto HDMI / Imagen' },
    { key: 'lectora', label: 'Lectora de discos' },
    { key: 'sellos', label: 'Sellos de garantía' },
    { key: 'encendido', label: 'Encendido / Fuente' },
    { key: 'usb', label: 'Puertos USB' },
    { key: 'wifi', label: 'Wi-Fi / Red' },
    { key: 'ventilacion', label: 'Ventilación' },
    { key: 'carcasa', label: 'Carcasa / Tornillos' },
  ],
  'Control / Mando': [
    { key: 'joysticks', label: 'Joysticks / Sin drift' },
    { key: 'botones', label: 'Botones / Cruceta' },
    { key: 'gatillos', label: 'Gatillos / Bumpers' },
    { key: 'carga', label: 'Carga / Batería' },
    { key: 'conexion', label: 'Conexión inalámbrica' },
    { key: 'vibracion', label: 'Vibración' },
    { key: 'audio', label: 'Conector de audio' },
    { key: 'carcasa', label: 'Carcasa / Tornillos' },
  ],
  'PC / Laptop': [
    { key: 'bisagras', label: 'Bisagras / Carcasa' },
    { key: 'teclado', label: 'Teclado' },
    { key: 'touchpad', label: 'Touchpad' },
    { key: 'pantalla', label: 'Pantalla / Imagen' },
    { key: 'carga', label: 'Carga / Batería' },
    { key: 'usb', label: 'Puertos USB' },
    { key: 'wifi', label: 'Wi-Fi / Red' },
    { key: 'almacenamiento', label: 'Disco / Arranque' },
  ],
  Tablet: [
    { key: 'cristales', label: 'Pantalla / Cristales' },
    { key: 'tactil', label: 'Pantalla táctil' },
    { key: 'camaras', label: 'Cámaras' },
    { key: 'carga', label: 'Puerto de carga' },
    { key: 'wifi', label: 'Wi-Fi / Red' },
    { key: 'botones', label: 'Botones' },
    { key: 'audio', label: 'Micrófono / Audio' },
    { key: 'chasis', label: 'Chasis sin doblar' },
  ],
  'Microsoldadura / Placa': [
    { key: 'corrosion', label: 'Sin corrosión / Humedad' },
    { key: 'pistas', label: 'Pistas / Pads íntegros' },
    { key: 'conectores', label: 'Conectores íntegros' },
    { key: 'componentes', label: 'Componentes completos' },
    { key: 'blindajes', label: 'Blindajes / Sellos' },
    { key: 'intervencion', label: 'Sin intervención previa' },
    { key: 'cortocircuito', label: 'Sin cortocircuito' },
    { key: 'alimentacion', label: 'Alimentación / Consumo' },
  ],
};

export interface TechNote {
  id: string;
  autor: string;
  fecha: string;
  contenido: string;
  tipo?: 'diagnostico' | 'repuesto' | 'reparacion' | 'general';
}

export interface AssignedPart {
  id: string;
  nombre: string;
  sku: string;
  cantidad: number;
  precioUnitario: number;
}

export interface Order {
  id: string; // e.g. 'OS-2418'
  cliente: {
    nombre: string;
    telefono: string;
    email?: string;
  };
  dispositivo: {
    categoria?: DeviceCategory;
    marca: string;
    modelo: string;
    imei: string;
    color?: string;
    tipoBloqueo?: 'PIN' | 'Patrón' | 'Ninguno';
    claveBloqueo?: string;
    patronPuntos?: number[]; // e.g. [1, 2, 5, 8] for 3x3 pattern
  };
  estado: OrderStatus;
  prioridadUrgente?: boolean;
  tecnico?: {
    nombre: string;
    iniciales: string;
    avatarBg?: string;
  } | null;
  ingreso: string; // e.g. '28 Ago · 09:14'
  fallaDeclarada: string;
  preDiagnostico?: string; // Pre-diagnóstico / Sospecha del Técnico
  observacionesFisicas: string;
  checklist: ReceptionChecklist;
  notasTecnicas: TechNote[];
  repuestosAsignados: AssignedPart[];
  fotosEvidencia?: string[];
  costoManoObra: number;
  totalEstimado: number;
  garantiaDias: number;
  fechaEntregaEstimada?: string;
  fechaEntrega?: string;
  metodoPago?: 'Efectivo' | 'Transferencia';
  montoCobrado?: number;
  parentOrderId?: string;
  motivoGarantia?: string;
}

export interface Technician {
  id: string;
  nombre: string;
  iniciales: string;
  especialidad: string;
  estado: 'Disponible' | 'Ocupado' | 'Ausente';
  ordenesActivas: number;
  capacidadMaxima: number;
  horasPromedio: number; // Horas promedio por reparación
  efectividad: number;   // Efectividad porcentual (e.g. 98.4%)
  salarioFijo?: number;  // Salario fijo mensual base
  comisionGenerada?: number;
  avatarBg?: string;
}

export interface InventoryItem {
  id: string;
  nombre: string;
  sku: string;
  categoria: 'Pantallas' | 'Baterías' | 'Flex y Puertos' | 'Microelectrónica/ICs' | 'Accesorios';
  stockActual: number;
  stockMinimo: number;
  costoCompra: number;
  precioVenta: number;
  compatibilidad: string;
  ubicacion: string; // e.g. 'Cajón A-12'
  imagenUrl?: string;
}

export interface InventoryMovement {
  id: string;
  repuestoNombre: string;
  codigoOrden?: string;
  tipo: 'consumo' | 'reabastecimiento' | 'ajuste';
  cantidad: number; // e.g. -1 or +25
  autor: string;
  tiempo: string;
}

export interface Client {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
  reparacionesRealizadas: number;
  saldoPendiente: number;
  ultimaVisita: string;
  dispositivosFrecuentes: string[];
}

export interface WhatsAppTemplates {
  ingreso: string;
  cambioEstatus: string;
  listoEntrega: string;
  cotizacionPendiente: string;
}

export type WhatsAppTemplateKey = keyof WhatsAppTemplates;

export interface WorkshopConfig {
  nombreTaller: string;
  direccion: string;
  telefono: string;
  email: string;
  rfc: string;
  impresoraDefecto: 'USB - Impresora Térmica 80mm' | 'Bluetooth - POS-80' | 'Red LAN - Thermal-01';
  anchoTicket: '80mm' | '58mm';
  diasGarantiaPantalla: number;
  diasGarantiaBateria: number;
  diasGarantiaPlaca: number;
  politicaGarantiaTexto: string;
  mensajeWhatsAppPlantilla?: string;
  whatsappApiUrl?: string;
  whatsappApiKey?: string;
  whatsappInstancia?: string;
  whatsappAutoSend?: boolean;
  plantillasWhatsApp: WhatsAppTemplates;
  simboloMoneda: string;
  tasaIva: number;
}

