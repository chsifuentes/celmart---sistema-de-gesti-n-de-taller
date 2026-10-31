import { isSupabaseMock, supabase } from './supabase';
import { isNetworkError, withNetworkDeadline } from './offlineSync';

const MEDIA_BUCKET = 'taller-media';

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('No se pudo leer la imagen.'));
    reader.onerror = () =>
      reject(reader.error ?? new Error('No se pudo leer la imagen.'));
    reader.onabort = () =>
      reject(new Error('Se canceló la lectura de la imagen.'));
    reader.readAsDataURL(blob);
  });
}

/** Resize without enlarging, preserve aspect ratio, and always encode real WebP. */
export async function compressImageToWebP(
  file: File,
  maxWidth = 1200,
  quality = 0.72
): Promise<Blob> {
  if (!file.type.startsWith('image/'))
    throw new Error('Selecciona un archivo de imagen.');
  if (!Number.isFinite(maxWidth) || maxWidth < 1)
    throw new Error('El ancho máximo debe ser positivo.');
  if (!Number.isFinite(quality) || quality < 0 || quality > 1)
    throw new Error('La calidad debe estar entre 0 y 1.');

  const source = await readAsDataUrl(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () =>
      reject(
        new Error('No se pudo abrir la imagen. Prueba con JPG, PNG o WebP.')
      );
    element.src = source;
  });
  if (!image.naturalWidth || !image.naturalHeight)
    throw new Error('La imagen no tiene dimensiones válidas.');

  const canvas = document.createElement('canvas');
  const scale = Math.min(1, Math.floor(maxWidth) / image.naturalWidth);
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Este navegador no puede procesar imágenes.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error('No se pudo comprimir la imagen.'));
          // Some browsers silently encode PNG when the requested format is unsupported.
          else if (blob.type !== 'image/webp')
            reject(
              new Error(
                'Este navegador no permite guardar WebP. Actualiza el navegador.'
              )
            );
          else resolve(blob);
        },
        'image/webp',
        quality
      );
    });
  } finally {
    // Release the decoded bitmap memory after each mobile camera capture.
    image.src = '';
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** All workshop uploads pass through the same client-side compression pipeline. */
export async function uploadWorkshopPhoto(
  file: File,
  folder: 'ordenes' | 'inventario',
  prefix: string
): Promise<string | null> {
  try {
    const compressed = await compressImageToWebP(file);
    if (
      isSupabaseMock ||
      (typeof navigator !== 'undefined' && navigator.onLine === false)
    ) {
      return await readAsDataUrl(compressed);
    }

    const safePrefix =
      prefix
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .slice(0, 80) || 'foto';
    const uniqueId = crypto.randomUUID();
    const path = `${folder}/${safePrefix}-${uniqueId}.webp`;
    let error: unknown;
    try {
      ({ error } = await withNetworkDeadline<{ error: unknown }>(() =>
        supabase.storage.from(MEDIA_BUCKET).upload(path, compressed, {
          contentType: 'image/webp',
          cacheControl: '31536000',
          upsert: false,
        })
      ));
    } catch (cause) {
      error = cause;
    }
    if (error && isNetworkError(error)) return await readAsDataUrl(compressed);
    if (error) throw error;
    const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    if (!data?.publicUrl)
      throw new Error('Storage no devolvió la URL pública de la imagen.');
    return data.publicUrl;
  } catch (error) {
    console.error('[CelMart] No se pudo comprimir o subir la foto:', error);
    return null;
  }
}
