import { initialWorkshopConfig } from '../data/initialData';
import type { WorkshopConfig } from '../types';
import { supabase } from './supabase';

const CACHE_KEY = 'celmart_workshop_config';
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function normalizeWorkshopConfig(value: unknown): WorkshopConfig {
  const source = isRecord(value) ? value : {};
  const result: WorkshopConfig = { ...initialWorkshopConfig, plantillasWhatsApp: { ...initialWorkshopConfig.plantillasWhatsApp } };
  const fields = result as unknown as Record<string, unknown>;
  for (const [key, fallback] of Object.entries(initialWorkshopConfig)) {
    const candidate = source[key];
    if (typeof fallback === 'string' && typeof candidate === 'string') fields[key] = candidate;
    if (typeof fallback === 'number' && typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) fields[key] = candidate;
  }
  const templates = isRecord(source.plantillasWhatsApp) ? source.plantillasWhatsApp : {};
  for (const key of Object.keys(result.plantillasWhatsApp) as (keyof WorkshopConfig['plantillasWhatsApp'])[]) {
    if (typeof templates[key] === 'string') result.plantillasWhatsApp[key] = templates[key];
  }
  for (const key of ['whatsappApiUrl', 'whatsappApiKey', 'whatsappInstancia', 'mensajeWhatsAppPlantilla'] as const) {
    if (typeof source[key] === 'string') result[key] = source[key];
  }
  result.whatsappAutoSend = source.whatsappAutoSend === true;
  if (!['80mm', '58mm'].includes(result.anchoTicket)) result.anchoTicket = initialWorkshopConfig.anchoTicket;
  if (!['USB - Impresora Térmica 80mm', 'Bluetooth - POS-80', 'Red LAN - Thermal-01'].includes(result.impresoraDefecto)) {
    result.impresoraDefecto = initialWorkshopConfig.impresoraDefecto;
  }
  return result;
}

export function readWorkshopConfigCache(): WorkshopConfig {
  try { return normalizeWorkshopConfig(JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')); }
  catch { return normalizeWorkshopConfig(null); }
}

export function cacheWorkshopConfig(config: WorkshopConfig): boolean {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(config)); return true; }
  catch { return false; }
}

export async function loadSharedWorkshopConfig(fallback: WorkshopConfig, database = supabase): Promise<WorkshopConfig> {
  const read = () => database.from('configuracion_taller').select('config_json').eq('id', 'default').maybeSingle();
  const first = await read();
  if (first.error) throw new Error(`No se pudo cargar la configuración compartida: ${first.error.message}`);
  if (first.data) return normalizeWorkshopConfig(first.data.config_json);
  // The first authenticated device migrates its cache. Concurrent devices never overwrite it.
  const { error } = await database.from('configuracion_taller').upsert(
    { id: 'default', config_json: normalizeWorkshopConfig(fallback) },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (error) throw new Error(`No se pudo inicializar la configuración compartida: ${error.message}`);
  const seeded = await read();
  if (seeded.error || !seeded.data) throw new Error(seeded.error?.message || 'No se pudo leer la configuración compartida.');
  return normalizeWorkshopConfig(seeded.data.config_json);
}

export async function saveSharedWorkshopConfig(config: WorkshopConfig, database = supabase): Promise<WorkshopConfig> {
  const { data, error } = await database.from('configuracion_taller').upsert(
    { id: 'default', config_json: normalizeWorkshopConfig(config) }, { onConflict: 'id' },
  ).select('config_json').single();
  if (error || !data) throw new Error(`No se guardó la configuración compartida: ${error?.message || 'sin acceso al registro'}`);
  return normalizeWorkshopConfig(data.config_json);
}
