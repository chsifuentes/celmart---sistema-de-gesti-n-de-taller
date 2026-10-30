/** Public tracking links always use the app origin and never include internal data. */
export function getTrackingUrl(orderId: string, origin?: string): string {
  const path = `/?track=${encodeURIComponent(orderId)}`;
  const source = origin ?? (typeof window !== 'undefined' ? window.location.origin : undefined);
  if (!source) return path;
  try {
    const url = new URL(source);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return path;
    return `${url.origin}${path}`;
  } catch {
    // SSR and opaque origins keep a safe relative link instead of inventing a host.
    return path;
  }
}
