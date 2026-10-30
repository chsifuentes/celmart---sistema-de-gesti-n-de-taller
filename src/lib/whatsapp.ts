import { Order, OrderStatus, WhatsAppTemplates, WhatsAppTemplateKey, WorkshopConfig } from '../types';

export const defaultWhatsAppTemplates: WhatsAppTemplates = {
  ingreso: `Hola *{{cliente}}* 👋\n\nTe informamos que tu equipo *{{dispositivo}}* ha ingresado exitosamente a *CelMart* con la Orden de Servicio *{{orden}}*.\n\n👨‍🔧 *Técnico Asignado:* {{tecnico}}\n📊 *Estado Inicial:* {{estado}}\n\nTe notificaremos por este medio conforme avance el diagnóstico y reparación. Si tienes dudas, puedes responder a este chat.`,
  
  cambioEstatus: `Hola *{{cliente}}* 👋\n\nActualización de tu servicio en *CelMart*:\nTu equipo *{{dispositivo}}* (Orden *{{orden}}*) ha cambiado al estado: *{{estado}}*.\n\n👨‍🔧 *Técnico Responsable:* {{tecnico}}\nEstamos trabajando para entregártelo lo antes posible con los más altos estándares de calidad.`,
  
  listoEntrega: `🎉 ¡Buenas noticias, *{{cliente}}*!\n\nTu equipo *{{dispositivo}}* (Orden *{{orden}}*) ya ha superado las pruebas de control de calidad y está *LISTO PARA ENTREGA* en sucursal CelMart.\n\n👨‍🔧 *Atendido por:* {{tecnico}}\nPuedes pasar a retirarlo en nuestro horario de atención presentando tu comprobante.\n\n¡Gracias por tu preferencia!`,
  
  cotizacionPendiente: `Hola *{{cliente}}* 👋\n\nTe contactamos de *CelMart* respecto a tu equipo *{{dispositivo}}* (Orden *{{orden}}*).\n\nEl técnico *{{tecnico}}* ha completado la revisión preliminar y tenemos listo tu presupuesto/cotización de reparación. Por favor confírmanos por este medio para autorizar los repuestos e iniciar la reparación.`
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

  return template
    .replace(/\{\{cliente\}\}/gi, clienteNombre)
    .replace(/\{\{dispositivo\}\}/gi, dispositivo)
    .replace(/\{\{orden\}\}/gi, orden)
    .replace(/\{\{estado\}\}/gi, estado)
    .replace(/\{\{tecnico\}\}/gi, tecnico)
    .replace(/\{\{taller\}\}/gi, taller);
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

const API_TIMEOUT_MS = 10_000;

/**
 * Contract for an adapter/webhook connected to Evolution API, WAHA or Cloud API.
 * A 2xx response means accepted by the endpoint, never confirmed phone delivery.
 * This function does not retry: an interrupted response can still have been sent.
 */
export async function sendAutomatedWhatsApp(
  order: Order,
  message: string,
  config: WorkshopConfig,
): Promise<{ sentViaApi: boolean; error?: string }> {
  if (!config.whatsappAutoSend || !config.whatsappApiUrl?.trim()) return { sentViaApi: false };
  const urlError = validateWhatsAppApiUrl(config.whatsappApiUrl);
  if (urlError) return { sentViaApi: false, error: urlError };
  if (!isValidWhatsAppPhone(order.cliente.telefono)) {
    return { sentViaApi: false, error: 'El teléfono del cliente no tiene un formato válido para WhatsApp.' };
  }
  if (!message.trim()) return { sentViaApi: false, error: 'El mensaje de WhatsApp está vacío.' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(config.whatsappApiUrl.trim(), {
      method: 'POST',
      headers: { ...whatsappApiHeaders(config), 'Content-Type': 'application/json' },
      credentials: 'omit',
      redirect: 'error',
      signal: controller.signal,
      body: JSON.stringify({
        phone: formatWhatsAppPhone(order.cliente.telefono),
        message,
        orderId: order.id,
        instance: config.whatsappInstancia?.trim(),
        mediaUrls: order.fotosEvidencia ?? [],
      }),
    });
    if (!response.ok) {
      return { sentViaApi: false, error: `El webhook respondió HTTP ${response.status}. Revisa la configuración antes de enviar manualmente.` };
    }
    return { sentViaApi: true };
  } catch {
    return {
      sentViaApi: false,
      error: controller.signal.aborted
        ? 'La API agotó el tiempo de espera. No se confirmó el envío; revisa WhatsApp antes de reenviar.'
        : 'No se confirmó la respuesta de la API. Revisa la conexión, CORS y WhatsApp antes de reenviar.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Connectivity-only check: HEAD never sends a message to a customer. */
export async function testWhatsAppConnection(
  config: WorkshopConfig,
): Promise<{ reachable: boolean; status?: number; error?: string }> {
  const urlError = validateWhatsAppApiUrl(config.whatsappApiUrl ?? '');
  if (urlError) return { reachable: false, error: urlError };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(config.whatsappApiUrl!.trim(), {
      method: 'HEAD',
      headers: whatsappApiHeaders(config),
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        reachable: false,
        status: response.status,
        error: response.status === 405
          ? 'El servidor respondió HTTP 405: esta ruta no admite HEAD. No se envió ningún mensaje ni se validó el envío.'
          : `El servidor respondió HTTP ${response.status}. No se envió ningún mensaje.`,
      };
    }
    return { reachable: true, status: response.status };
  } catch {
    return {
      reachable: false,
      error: controller.signal.aborted
        ? 'El servidor no respondió dentro de 10 segundos. No se envió ningún mensaje.'
        : 'No se pudo comprobar la conexión desde este navegador. Revisa la URL, la red y CORS. No se envió ningún mensaje.',
    };
  } finally {
    clearTimeout(timeout);
  }
}
