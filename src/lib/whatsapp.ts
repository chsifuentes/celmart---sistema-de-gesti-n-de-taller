import { Order, OrderStatus, WhatsAppTemplates, WhatsAppTemplateKey, WorkshopConfig } from '../types';
import { getTrackingUrl } from './trackingUrl';

const trackingFooter = '\n\n🔎 Sigue tu reparación: {{link_seguimiento}}';

const messageTemplates: WhatsAppTemplates = {
  ingreso: `Hola *{{cliente}}* 👋\n\nTe informamos que tu equipo *{{dispositivo}}* ha ingresado exitosamente a *CelMart* con la Orden de Servicio *{{orden}}*.\n\n👨‍🔧 *Técnico Asignado:* {{tecnico}}\n📊 *Estado Inicial:* {{estado}}\n\nTe notificaremos por este medio conforme avance el diagnóstico y reparación. Si tienes dudas, puedes responder a este chat.`,
  
  cambioEstatus: `Hola *{{cliente}}* 👋\n\nActualización de tu servicio en *CelMart*:\nTu equipo *{{dispositivo}}* (Orden *{{orden}}*) ha cambiado al estado: *{{estado}}*.\n\n👨‍🔧 *Técnico Responsable:* {{tecnico}}\nEstamos trabajando para entregártelo lo antes posible con los más altos estándares de calidad.`,
  
  listoEntrega: `🎉 ¡Buenas noticias, *{{cliente}}*!\n\nTu equipo *{{dispositivo}}* (Orden *{{orden}}*) ya ha superado las pruebas de control de calidad y está *LISTO PARA ENTREGA* en sucursal CelMart.\n\n👨‍🔧 *Atendido por:* {{tecnico}}\nPuedes pasar a retirarlo en nuestro horario de atención presentando tu comprobante.\n\n¡Gracias por tu preferencia!`,
  
  cotizacionPendiente: `Hola *{{cliente}}* 👋\n\nTe contactamos de *CelMart* respecto a tu equipo *{{dispositivo}}* (Orden *{{orden}}*).\n\nEl técnico *{{tecnico}}* ha completado la revisión preliminar y tenemos listo tu presupuesto/cotización de reparación. Por favor confírmanos por este medio para autorizar los repuestos e iniciar la reparación.`
};

// Every default notification offers the same public, PIN-free tracking route.
export const defaultWhatsAppTemplates: WhatsAppTemplates = {
  ingreso: messageTemplates.ingreso + trackingFooter,
  cambioEstatus: messageTemplates.cambioEstatus + trackingFooter,
  listoEntrega: messageTemplates.listoEntrega + trackingFooter,
  cotizacionPendiente: messageTemplates.cotizacionPendiente + trackingFooter,
};

/**
 * Formatea el número telefónico para WhatsApp (wa.me)
 * Asegura el formato oficial de México +521 o internacional limpio sin símbolos
 */
export function formatWhatsAppPhone(rawPhone: string): string {
  if (!rawPhone) return '';
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return '';

  // 10 dígitos (México: ej. 5589001234 -> 5215589001234)
  if (digits.length === 10) {
    return `521${digits}`;
  }

  // 12 dígitos que ya comienzan con 52 (código de país sin el 1 de móvil)
  if (digits.length === 12 && digits.startsWith('52')) {
    return `521${digits.slice(2)}`;
  }

  // 13 dígitos que ya tienen 521
  if (digits.length === 13 && digits.startsWith('521')) {
    return digits;
  }

  // Prefijos locales antiguos como 044 o 045 (13 dígitos)
  if ((digits.startsWith('044') || digits.startsWith('045')) && digits.length === 13) {
    return `521${digits.slice(3)}`;
  }

  return digits;
}

/**
 * Reemplaza las variables dinámicas de la plantilla con los datos reales de la orden
 * Variables requeridas: {{cliente}}, {{dispositivo}}, {{orden}}, {{estado}}, {{tecnico}}
 */
export function replaceWhatsAppVariables(
  template: string,
  order: Order,
  config?: WorkshopConfig
): string {
  if (!template) return '';

  const clienteNombre = order.cliente?.nombre || 'Estimado(a) Cliente';
  const marca = order.dispositivo?.marca || '';
  const modelo = order.dispositivo?.modelo || 'Dispositivo móvil';
  const dispositivo = `${marca} ${modelo}`.trim();
  const orden = order.id || 'S/N';
  const estado = order.estado || 'En Revisión';
  const tecnico = order.tecnico?.nombre || 'Técnico Especialista';
  const taller = config?.nombreTaller || 'CelMart';

  const variables: Record<string, string> = {
    cliente: clienteNombre, dispositivo, orden, estado, tecnico, taller,
    link_seguimiento: getTrackingUrl(order.id),
  };
  return template.replace(/\{\{(cliente|dispositivo|orden|estado|tecnico|taller|link_seguimiento)\}\}/gi,
    (_match, variable: string) => variables[variable.toLowerCase()]);
}

/** Customer-facing delivery receipt: no unlock codes, internal notes or API data. */
export function buildDeliveryWhatsAppMessage(order: Order, config: WorkshopConfig): string {
  const money = (value: number) => `${config.simboloMoneda || '$'}${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
  const parts = order.repuestosAsignados ?? [];
  const partsTotal = parts.reduce((total, part) => total + part.cantidad * part.precioUnitario, 0);
  const deliveredDate = order.fechaEntrega ? new Date(order.fechaEntrega) : null;
  const deliveryDate = deliveredDate && !Number.isNaN(deliveredDate.getTime())
    ? deliveredDate.toLocaleString('es-MX', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'No registrada';
  return [
    `*${config.nombreTaller} · COMPROBANTE DE ENTREGA*`,
    `Orden: *${order.id}*`,
    `Cliente: ${order.cliente.nombre}`,
    `Equipo: ${[order.dispositivo.marca, order.dispositivo.modelo].filter(Boolean).join(' ')}`,
    `Fecha de entrega: ${deliveryDate}`,
    ...(order.metodoPago ? [`Método de pago: ${order.metodoPago}`, `Cobrado: ${money(order.montoCobrado ?? 0)}`] : []),
    '',
    `Mano de obra: ${money(order.costoManoObra)}`,
    'Refacciones:',
    ...(parts.length ? parts.map((part) => `• ${part.cantidad} × ${part.nombre}: ${money(part.cantidad * part.precioUnitario)}`) : ['• Sin refacciones adicionales.']),
    `*Total del servicio: ${money(order.costoManoObra + partsTotal)}*`,
    '',
    `*Garantía: ${order.garantiaDias} días.*`,
    config.politicaGarantiaTexto,
    'Conserva este comprobante para cualquier aclaración o revisión de garantía.',
    '',
    `Seguimiento de tu servicio: ${getTrackingUrl(order.id)}`,
    ...(config.telefono ? [`Contacto del taller: ${config.telefono}`] : []),
    'Gracias por tu confianza.',
  ].join('\n');
}

/**
 * Determina automáticamente la plantilla sugerida de acuerdo al estatus de la orden
 */
export function determineTemplateKeyForStatus(status: OrderStatus): WhatsAppTemplateKey {
  switch (status) {
    case 'Listo':
    case 'Entregado':
      return 'listoEntrega';
    case 'Esperando Presupuesto':
      return 'cotizacionPendiente';
    case 'Recibido':
      return 'ingreso';
    case 'En Diagnóstico':
    case 'Esperando Repuesto':
    case 'En Reparación':
    default:
      return 'cambioEstatus';
  }
}

/**
 * Genera el enlace oficial wa.me con el texto debidamente codificado
 */
export function buildWhatsAppLink(rawPhone: string, message: string): string {
  const cleanPhone = formatWhatsAppPhone(rawPhone);
  const encodedText = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encodedText}`;
}

export function isValidWhatsAppPhone(rawPhone: string): boolean {
  return /^[1-9]\d{7,14}$/.test(formatWhatsAppPhone(rawPhone));
}

export function validateWhatsAppApiUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      return 'Usa una URL HTTP o HTTPS sin usuario ni contraseña dentro de la dirección.';
    }
    return null;
  } catch {
    return 'Introduce una URL HTTP o HTTPS válida para el webhook de WhatsApp.';
  }
}

function whatsappApiHeaders(config: WorkshopConfig): Record<string, string> {
  const key = config.whatsappApiKey?.trim();
  return {
    Accept: 'application/json',
    ...(key ? { apikey: key, Authorization: `Bearer ${key}` } : {}),
  };
}

export const WHATSAPP_TIMEOUT_MS = 1500;

/** Deadline still resolves when an intermediary ignores AbortSignal. No retries. */
export async function withWhatsAppDeadline<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DOMException('Tiempo de espera agotado (1.5 s)', 'TimeoutError'));
    }, WHATSAPP_TIMEOUT_MS);
  });
  try { return await Promise.race([run(controller.signal), deadline]); }
  finally { clearTimeout(timer!); }
}

export function evolutionEndpoint(config: WorkshopConfig, route: 'send' | 'state'): string {
  const base = (config.whatsappApiUrl || '').trim().replace(/\/+$/, '');
  const instance = encodeURIComponent(config.whatsappInstancia?.trim() || '');
  return `${base}/${route === 'send' ? 'message/sendText' : 'instance/connectionState'}/${instance}`;
}

export async function sendAutomatedWhatsApp(order: Order, message: string, config: WorkshopConfig): Promise<{ sentViaApi: boolean; error?: string }> {
  if (!config.whatsappAutoSend || !config.whatsappApiUrl?.trim()) return { sentViaApi: false };
  const urlError = validateWhatsAppApiUrl(config.whatsappApiUrl);
  if (urlError) return { sentViaApi: false, error: urlError };
  if (!isValidWhatsAppPhone(order.cliente.telefono)) return { sentViaApi: false, error: 'El teléfono del cliente no tiene un formato válido para WhatsApp.' };
  if (!message.trim()) return { sentViaApi: false, error: 'El mensaje de WhatsApp está vacío.' };
  if (config.whatsappProvider === 'evolution' && !config.whatsappInstancia?.trim()) return { sentViaApi: false, error: 'Configura la instancia de Evolution API.' };
  try {
    const evolution = config.whatsappProvider === 'evolution';
    const response = await withWhatsAppDeadline(signal => fetch(evolution ? evolutionEndpoint(config, 'send') : config.whatsappApiUrl!.trim(), {
      method: 'POST', headers: { ...whatsappApiHeaders(config), 'Content-Type': 'application/json' },
      credentials: 'omit', redirect: 'error', signal,
      body: JSON.stringify(evolution
        ? { number: formatWhatsAppPhone(order.cliente.telefono), text: message }
        : { phone: formatWhatsAppPhone(order.cliente.telefono), message, orderId: order.id, instance: config.whatsappInstancia?.trim(), mediaUrls: order.fotosEvidencia ?? [] }),
    }));
    if (!response.ok) return { sentViaApi: false, error: `El webhook respondió HTTP ${response.status}. Continúa con WhatsApp manual.` };
    return { sentViaApi: true };
  } catch (error) {
    return { sentViaApi: false, error: error instanceof DOMException && ['TimeoutError','AbortError'].includes(error.name)
      ? 'La API agotó el tiempo de espera (1.5 s). No se confirmó el envío; revisa WhatsApp antes de reenviar.'
      : 'No se confirmó la respuesta de la API. Revisa la conexión, CORS y WhatsApp antes de reenviar.' };
  }
}

/** Evolution verifies the linked instance; a generic webhook probe verifies HTTP only. */
export async function testWhatsAppConnection(config: WorkshopConfig): Promise<{ reachable: boolean; status?: number; error?: string }> {
  const urlError = validateWhatsAppApiUrl(config.whatsappApiUrl ?? '');
  if (urlError) return { reachable: false, error: urlError };
  const evolution = config.whatsappProvider === 'evolution';
  if (evolution && !config.whatsappInstancia?.trim()) return { reachable: false, error: 'Configura la instancia de Evolution API.' };
  try {
    return await withWhatsAppDeadline(async signal => {
      const response = await fetch(evolution ? evolutionEndpoint(config, 'state') : config.whatsappApiUrl!.trim(), {
        method: evolution ? 'GET' : 'HEAD', headers: whatsappApiHeaders(config), credentials: 'omit', redirect: 'error', cache: 'no-store', signal,
      });
      if (!response.ok) return { reachable: false, status: response.status, error: response.status === 405
        ? 'El servidor respondió HTTP 405: esta ruta no admite HEAD. No se envió ningún mensaje.' : `El servidor respondió HTTP ${response.status}.` };
      if (evolution) {
        const data: unknown = await response.json();
        const state = (data as { instance?: { state?: string } })?.instance?.state;
        if (state !== 'open') return { reachable: false, status: response.status, error: 'La instancia no está conectada a WhatsApp. Conecta su QR en Evolution.' };
      }
      return { reachable: true, status: response.status };
    });
  } catch {
    return { reachable: false, error: 'No hubo respuesta en 1.5 s o falló la conexión/CORS. Disponible el modo manual wa.me.' };
  }
}
