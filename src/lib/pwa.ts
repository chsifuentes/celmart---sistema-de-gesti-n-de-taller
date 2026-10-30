/** Install support uses only static resources; workshop/API data is never cached. */
export function registerPWA(): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined'
    || !(import.meta as any).env?.PROD || !('serviceWorker' in navigator)) return;
  if (!window.isSecureContext) return;

  const register = () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((error: unknown) => console.warn('[CelMart] No se pudo activar el acceso instalado:', error));
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
