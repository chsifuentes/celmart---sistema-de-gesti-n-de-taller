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
    <div className="space-y-2 text-sm">
      <p className="text-zinc-400 break-words">
        Ubicación en taller:{' '}
        <strong className="text-zinc-100">
          {order.ubicacionFisica || 'Sin asignar'}
        </strong>
      </p>
      <button
        type="button"
        className="min-h-11 w-full rounded-lg border border-zinc-700 px-2 text-sm"
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
            className="w-full rounded bg-zinc-800 p-3"
          />
          <button
            disabled={busy || !value.trim()}
            className="min-h-11 w-full bg-teal-400 text-black rounded"
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
