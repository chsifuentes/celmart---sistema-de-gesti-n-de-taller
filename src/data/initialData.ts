import { Order, Technician, InventoryItem, InventoryMovement, Client, WorkshopConfig } from '../types';

export const initialWorkshopConfig: WorkshopConfig = {
  nombreTaller: 'CelMart',
  direccion: 'Av. Insurgentes Sur #423, Col. Roma Norte, CDMX',
  telefono: '+52 55 8900 1234',
  email: 'soporte@celmart.mx',
  rfc: 'CMT-230815-9X1',
  impresoraDefecto: 'USB - Impresora Térmica 80mm',
  anchoTicket: '80mm',
  diasGarantiaPantalla: 90,
  diasGarantiaBateria: 180,
  diasGarantiaPlaca: 30,
  politicaGarantiaTexto: 'Garantía válida únicamente con este comprobante o IMEI. No cubre daños por humedad, golpes posteriores, sobrevoltaje ni manipulación de terceros.',
  mensajeWhatsAppPlantilla: 'Hola {{cliente}}, te informamos que tu dispositivo {{dispositivo}} (Orden {{orden}}) se encuentra en estado: *{{estado}}*. CelMart Servicio Técnico.',
  simboloMoneda: '$',
  tasaIva: 16,
};

export const initialTechnicians: Technician[] = [];

export const initialInventoryItems: InventoryItem[] = [];

export const initialInventoryMovements: InventoryMovement[] = [];

export const initialClients: Client[] = [];

export const initialOrders: Order[] = [];
