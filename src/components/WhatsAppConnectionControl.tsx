import React, { useEffect, useState } from 'react';
import type { WorkshopConfig } from '../types';
import { testWhatsAppConnection } from '../lib/whatsapp';

export function WhatsAppConnectionControl({
  config,
  onModeChange,
}: {
  config: WorkshopConfig;
  onModeChange: (enabled: boolean) => Promise<void> | void;
}) {
  const [status, setStatus] = useState<{
    key: string;
    connected: boolean;
    detail: string;
  }>({ key: '', connected: false, detail: '' });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const key = JSON.stringify([
    config.whatsappAutoSend,
    config.whatsappApiUrl,
    config.whatsappApiKey,
    config.whatsappInstancia,
    config.whatsappProvider,
  ]);
  useEffect(() => {
    let active = true,
      checking = false;
    const check = async () => {
      if (
        checking ||
        !config.whatsappAutoSend ||
        !config.whatsappApiUrl?.trim() ||
        document.visibilityState === 'hidden'
      )
        return;
      checking = true;
      const result = await testWhatsAppConnection(config);
      if (active)
        setStatus({
          key,
          connected: result.reachable,
          detail:
            result.error ||
            (config.whatsappProvider === 'evolution'
              ? 'Instancia WhatsApp conectada'
              : 'Webhook accesible; entrega no confirmada'),
        });
      checking = false;
    };
    void check();
    const timer = setInterval(() => void check(), 30000);
    window.addEventListener('online', check);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('online', check);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [key]);
  const connected =
    config.whatsappAutoSend && status.key === key && status.connected;
  return (
    <div className="text-xs space-y-1 min-w-0">
      <span
        role="status"
        title={
          status.key === key
            ? status.detail
            : 'El modo manual permanece disponible.'
        }
        className={connected ? 'text-emerald-300' : 'text-zinc-400'}
      >
        {connected ? '🟢 Conectado' : '⚪ Modo Manual wa.me'}
      </span>
      <label className="block">
        Modo de Envío
        <select
          aria-label="Modo de Envío"
          disabled={busy}
          value={config.whatsappAutoSend ? 'auto' : 'manual'}
          className="block w-full bg-zinc-800 rounded p-2"
          onChange={async (event) => {
            const enabled = event.target.value === 'auto';
            setBusy(true);
            setError('');
            try {
              await onModeChange(enabled);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : 'No se pudo guardar el modo'
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <option value="auto">Automático por API</option>
          <option value="manual">Enlace directo manual wa.me</option>
        </select>
      </label>
      {busy && <span>Guardando…</span>}
      {error && (
        <p role="alert" className="text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
