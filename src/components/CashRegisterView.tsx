import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { offlineStore, withSyncTimeout } from '../lib/offlineRepository';
import { browserOnline } from '../lib/offlineSync';
import {
  cashNet,
  workshopDate,
  type CashSummary,
  type CashClose,
} from '../lib/operations';
export function CashRegisterView({
  width = '80mm',
  onOpenQuickSale,
}: {
  width?: '80mm' | '58mm';
  onOpenQuickSale?: () => void;
}) {
  const [summary, setSummary] = useState<CashSummary | null>(null),
    [closed, setClosed] = useState<CashClose | null>(null),
    [opening, setOpening] = useState('0'),
    [notes, setNotes] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const refreshGeneration = useRef(0);
  const closing = useRef(false);
  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    const current = () => mounted.current && generation === refreshGeneration.current;
    if (
      !browserOnline() ||
      offlineStore.getSnapshot().offline ||
      offlineStore.getSnapshot().pending
    ) {
      if (current()) {
        setSummary(null);
        setClosed(null);
        setError('Sincroniza los cambios de todos los dispositivos antes de consultar o cerrar la caja.');
      }
      return;
    }
    try {
      if (current()) setError('');
      const date = workshopDate();
      const [s, c] = await Promise.all([
        withSyncTimeout<{ data: CashSummary; error: unknown }>(
          () => supabase.rpc('resumen_caja', { p_fecha: date })
        ),
        withSyncTimeout<{ data: CashClose | null; error: unknown }>(() =>
          supabase.from('cortes_caja').select('*').eq('fecha', date).maybeSingle()
        ),
      ]);
      if (s.error) throw s.error;
      if (c.error) throw c.error;
      if (current()) {
        setSummary(s.data);
        setClosed(c.data);
      }
    } catch (e) {
      if (current()) {
        setSummary(null);
        setClosed(null);
        setError(e instanceof Error ? e.message : String((e as { message?: unknown })?.message || e));
      }
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const c = supabase
      .channel('cash-register')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ordenes' },
        () => void refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'movimientos_inventario' },
        () => void refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cortes_caja' },
        () => void refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ventas_mostrador' },
        () => void refresh()
      )
      .subscribe();
    const triggerRefresh = () => void refresh();
    const unsubscribe = offlineStore.subscribe(triggerRefresh);
    window.addEventListener('focus', triggerRefresh);
    return () => {
      mounted.current = false;
      refreshGeneration.current++;
      void supabase.removeChannel(c);
      unsubscribe();
      window.removeEventListener('focus', triggerRefresh);
    };
  }, [refresh]);
  const close = async () => {
    if (closing.current) return;
    if (
      !browserOnline() ||
      offlineStore.getSnapshot().offline ||
      offlineStore.getSnapshot().pending
    ) {
      setError('Sincroniza los cambios antes de cerrar la caja.');
      return;
    }
    const amount = Number(opening);
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Indica un monto de apertura válido.');
      return;
    }
    closing.current = true;
    setBusy(true);
    setError('');
    try {
      const r = await withSyncTimeout<{ data: CashClose; error: unknown }>(() =>
        supabase.rpc('cerrar_caja', {
          p_apertura: amount,
          p_observaciones: notes,
        })
      );
      if (r.error) throw r.error;
      if (!mounted.current) return;
      setClosed(r.data);
      await refresh();
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String((e as { message?: unknown })?.message || 'No se pudo cerrar caja'));
    } finally {
      closing.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const s = closed || summary;
  const money = (n: number) =>
    Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
  return (
    <section className="max-w-2xl space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-sm font-semibold text-zinc-100">Corte de Caja · <span className="font-mono">{workshopDate()}</span></h1>
        {onOpenQuickSale && <button type="button" onClick={onOpenQuickSale} className="rounded-md border border-zinc-800/80 bg-[#1c1c20] px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:border-zinc-700">⚡ Venta Rápida Mostrador</button>}
      </div>
      <p className="text-xs text-zinc-400">
        Día de operación: Ciudad de México. Apertura + cobros − costo de
        repuestos consumidos. El neto incluye transferencias y tarjeta; no representa sólo
        billetes en caja.
      </p>
      {error && (
        <p role="alert" className="text-rose-300">
          {error}
        </p>
      )}
      <button onClick={() => void refresh()} className="rounded-md border border-zinc-800/80 bg-[#1c1c20] px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:border-zinc-700">
        Actualizar resumen
      </button>
      {s && (
        <div
          id="cash-ticket"
          className="rounded-lg border border-zinc-800/80 bg-[#161619] text-zinc-200 p-4 space-y-2 font-mono text-xs"
        >
          <h2 className="font-bold">CELMART · CORTE DE CAJA</h2>
          <p>
            {s.fecha} · {closed ? 'CERRADO' : 'VISTA PREVIA'}
          </p>
          <p>Efectivo: {money(s.total_efectivo)}</p>
          <p>Transferencias: {money(s.total_transferencia)}</p>
          <p>Tarjeta: {money(s.total_tarjeta ?? 0)}</p>
          <p>Repuestos consumidos: {money(s.gastos_repuestos)}</p>
          <p>Apertura: {money(closed?.monto_apertura ?? Number(opening))}</p>
          <strong>
            Neto:{' '}
            {money(closed?.total_neto ?? cashNet(Number(opening) || 0, s))}
          </strong>
          {closed && (
            <>
              <p>Cerrado por: {closed.cerrado_por}</p>
              <p>{closed.observaciones}</p>
              <p>{new Date(closed.created_at).toLocaleString('es-MX')}</p>
            </>
          )}
        </div>
      )}
      {summary?.sin_metodo ? (
        <p role="alert" className="text-amber-300">
          {summary.sin_metodo} entregas sin pago clasificado: regulariza sus
          cobros antes de cerrar.
        </p>
      ) : null}
      {!closed && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void close();
          }}
          className="space-y-3"
        >
          <label className="block">
            Monto de apertura
            <input
              aria-label="Monto de apertura"
              type="number"
              min="0"
              step="0.01"
              required
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              className="mt-1 block rounded-md border border-zinc-800/80 bg-[#1c1c20] px-3 py-2 text-xs font-mono text-zinc-100 outline-none focus:border-zinc-700"
            />
          </label>
          <label className="block">
            Observaciones
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 block w-full rounded-md border border-zinc-800/80 bg-[#1c1c20] px-3 py-2 text-xs text-zinc-100 outline-none focus:border-zinc-700"
            />
          </label>
          <button
            disabled={busy || !summary || !!summary.sin_metodo}
            className="rounded-md bg-zinc-100 px-3.5 py-2 text-xs font-semibold text-zinc-950 hover:bg-white disabled:opacity-40"
          >
            {busy ? 'Cerrando…' : 'Cerrar Caja del Día'}
          </button>
        </form>
      )}
      {closed && (
        <button
          onClick={() => window.print()}
          className="rounded-md bg-zinc-100 px-3.5 py-2 text-xs font-semibold text-zinc-950 hover:bg-white"
        >
          Imprimir corte {width}
        </button>
      )}
      <p className="text-xs text-zinc-500">
        Los costos se registran al asignar piezas desde esta versión. Los
        consumos históricos sin costo guardado no se estiman. El corte guardado
        es una fotografía definitiva del cierre.
      </p>
      <style>{`@media print{body *{visibility:hidden!important}#cash-ticket,#cash-ticket *{visibility:visible!important;color:black!important}#cash-ticket{position:absolute;top:0;left:0;width:${width};font:11px monospace;padding:3mm;box-sizing:border-box;background:white!important;border:0!important}@page{size:${width} auto;margin:0}}`}</style>
    </section>
  );
}
