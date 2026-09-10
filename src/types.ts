export type OrderStatus =
  | 'Recibido'
  | 'En Diagnóstico'
  | 'Esperando Presupuesto'
  | 'Esperando Repuesto'
  | 'En Reparación'
  | 'Listo'
  | 'Entregado'
  | 'Garantía';

export interface ReceptionChecklist {
  equipoApagado?: boolean;
  camaras: boolean;
  carga: boolean;
  wifi: boolean;
  botones: boolean;
  cristales: boolean;
  biometria: boolean; // Huella o FaceID
  audio: boolean;     // Micrófono y Parlante
  chasis: boolean;    // Sin golpes graves
}

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
  costoManoObra: number;
  totalEstimado: number;
  garantiaDias: number;
  fechaEntregaEstimada?: string;
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
  plantillasWhatsApp: WhatsAppTemplates;
  simboloMoneda: string;
  tasaIva: number;
}

