import React, { useEffect, useRef, useState } from 'react';
import type { Order } from '../types';
export function LocationControl({
  order,
  onSave,
}: {
  order: Order;
  onSave: (id: string, value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false),
    [value, setValue] = useState(order.ubicacionFisica || ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef(false);
  useEffect(() => {
    if (!editing) setValue(order.ubicacionFisica || '');
  }, [order.ubicacionFisica, editing]);
  return (
    <div className="space-y-2 text-xs">
      <p className="text-zinc-400 break-words">
        Ubicación en taller:{' '}
        <strong className="text-zinc-100">
          {order.ubicacionFisica || 'Sin asignar'}
        </strong>
      </p>
      <button
        type="button"
        className="min-h-9 rounded-md border border-zinc-800/80 bg-[#1c1c20] px-2 text-xs text-zinc-400"
        onClick={() => setEditing(!editing)}
        disabled={busy}
      >
        📍 Asignar Ubicación Física
      </button>
      {editing && (
        <form
          className="space-y-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending.current) return;
            pending.current = true;
            setBusy(true);
            setError('');
            try {
              await onSave(order.id, value.trim());
              setEditing(false);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              pending.current = false;
              setBusy(false);
            }
          }}
        >
          <input
            aria-label={`Ubicación física ${order.id}`}
            placeholder="Gaveta B-04"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
            maxLength={120}
            disabled={busy}
            className="w-full rounded-md border border-zinc-800/80 bg-[#1c1c20] p-2 text-xs"
          />
          <button
            disabled={busy || !value.trim()}
            className="min-h-9 w-full bg-zinc-100 text-zinc-950 rounded-md text-xs"
          >
            {busy ? 'Guardando…' : 'Guardar ubicación'}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
