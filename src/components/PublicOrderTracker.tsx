import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, CheckCircle2, CircleAlert, Clock3, ImageIcon, LoaderCircle, MessageCircle, PackageCheck, RefreshCw, ShieldCheck, Smartphone, Wrench, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { buildWhatsAppLink, isValidWhatsAppPhone } from '../lib/whatsapp';
import { fetchPublicOrderTracking, getTrackingProgress, isValidTrackingOrderId, type PublicOrderTracking } from '../lib/publicTracking';

type TrackingState = { orderId: string; status: 'loading' | 'ready' | 'notfound' | 'error'; order: PublicOrderTracking | null; error: string; updatedAt: Date | null };
const initialState = (orderId: string): TrackingState => ({ orderId, status: 'loading', order: null, error: '', updatedAt: null });
const STEPS = ['Recibido', 'Diagnóstico', 'Reparación', 'Listo', 'Entregado'];
const money = (amount: number, symbol: string) => `${symbol}${symbol.length > 1 ? ' ' : ''}${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function PhotoPreview({ url, onClose }: { url: string; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    closeButton.current?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  return (
    <div role="dialog" aria-modal="true" aria-label="Foto del equipo ampliada" className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={onClose} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') { event.preventDefault(); closeButton.current?.focus(); }
    }}>
      <button ref={closeButton} type="button" onClick={onClose} aria-label="Cerrar foto ampliada" className="absolute top-4 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-teal-400"><X className="h-5 w-5" /></button>
      <img src={url} alt="Evidencia del estado de tu equipo" className="max-h-[88dvh] max-w-full rounded-xl object-contain" onClick={(event) => event.stopPropagation()} />
    </div>
  );
}

interface PublicTrackingRecordProps {
  order: PublicOrderTracking;
  refreshing?: boolean;
  live?: boolean;
  updatedAt?: Date | null;
  error?: string;
  onRefresh?: () => void;
  onSelectPhoto?: (url: string) => void;
}

/** Pure public presentation, separate from request state for privacy/layout checks. */
export function PublicTrackingRecord({ order, refreshing = false, live = false, updatedAt = null, error = '', onRefresh = () => {}, onSelectPhoto = () => {} }: PublicTrackingRecordProps) {
  const progress = getTrackingProgress(order.estado);
  const whatsappUrl = isValidWhatsAppPhone(order.taller.telefono)
    ? buildWhatsAppLink(order.taller.telefono, `Hola, quisiera consultar el avance de mi equipo con la orden ${order.id}.`)
    : null;
  return (
    <>
            <section className="rounded-2xl border border-white/10 bg-[#141a20] p-5 sm:p-7 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-widest text-zinc-400">Orden <span className="font-mono font-bold text-zinc-200 tracking-normal ml-1">{order.id}</span></p>
                <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${progress.hold ? 'bg-amber-400/10 text-amber-300' : order.estado === 'Listo' || order.estado === 'Entregado' ? 'bg-teal-400/10 text-teal-300' : 'bg-sky-400/10 text-sky-300'}`}><span className="w-1.5 h-1.5 rounded-full bg-current" />{order.estado}</span>
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl leading-tight font-bold tracking-tight">{progress.title}</h1>
                <p className="mt-3 text-sm text-zinc-400 leading-relaxed">{progress.description}</p>
              </div>
              <ol aria-label="Etapas de la reparación" className="grid grid-cols-1 sm:grid-cols-5 gap-3 sm:gap-2 pt-2">
                {STEPS.map((label, index) => {
                  const completed = index < progress.step || order.estado === 'Entregado';
                  const active = index === progress.step;
                  return <li key={label} aria-current={active ? 'step' : undefined} className={`flex sm:flex-col sm:text-center items-center gap-3 sm:gap-2 p-2 rounded-xl ${active ? 'bg-white/5' : ''}`}>
                    <span className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center font-mono text-sm border ${completed ? 'bg-teal-400 text-zinc-950 border-teal-400' : active ? 'border-teal-400 text-teal-300 bg-teal-400/10' : 'border-zinc-700 text-zinc-600'}`}>{completed ? <Check className="w-4 h-4" /> : index + 1}</span>
                    <span className={`text-sm sm:text-xs ${active || completed ? 'text-zinc-100 font-semibold' : 'text-zinc-500'}`}>{label}{active && progress.hold && <span className="block text-[10px] text-amber-300 font-normal mt-0.5">{order.estado === 'Garantía' ? 'En garantía' : 'En espera'}</span>}</span>
                  </li>;
                })}
              </ol>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10 text-xs text-zinc-500">
                <p className="inline-flex items-center gap-2"><span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-teal-400' : 'bg-zinc-500'}`} />{refreshing ? 'Actualizando…' : 'Actualización automática'}{updatedAt && ` · ${updatedAt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`}</p>
                <button type="button" onClick={() => onRefresh()} disabled={refreshing} className="min-h-10 inline-flex items-center gap-2 text-zinc-300 disabled:opacity-40"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />Actualizar</button>
              </div>
              {error && <p role="alert" className="rounded-xl bg-amber-400/10 border border-amber-700/30 p-3 text-xs text-amber-200">{error} La información mostrada corresponde a la última consulta exitosa.</p>}
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
              <section className="rounded-2xl border border-white/10 bg-[#141a20] p-5 sm:p-6 space-y-4">
                <h2 className="text-sm font-semibold flex items-center gap-2"><Smartphone className="h-4 w-4 text-teal-400" />Tu equipo</h2>
                <div><p className="text-xs text-zinc-500">{order.dispositivo.categoria}</p><p className="mt-1 text-lg font-bold break-words">{`${order.dispositivo.marca} ${order.dispositivo.modelo}`.trim() || 'Equipo en reparación'}</p></div>
                <div><p className="text-xs text-zinc-500 mb-1">Falla reportada</p><p className="text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap break-words">{order.fallaDeclarada || 'El taller está revisando la falla.'}</p></div>
                <p className="text-xs text-zinc-500 pt-3 border-t border-white/10">Teléfono registrado: <span className="font-mono text-zinc-300">{order.clienteTelefonoMascara}</span></p>
              </section>

              <section className="rounded-2xl border border-white/10 bg-[#141a20] p-5 sm:p-6 space-y-4">
                <h2 className="text-sm font-semibold flex items-center gap-2"><PackageCheck className="h-4 w-4 text-teal-400" />Presupuesto de reparación</h2>
                <dl className="space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-zinc-400">Mano de obra</dt><dd className="shrink-0 font-mono">{money(order.costoManoObra, order.taller.simboloMoneda)}</dd></div></dl>
                {order.repuestos.length ? <ul className="space-y-3 border-t border-white/10 pt-3">{order.repuestos.map((part, index) => <li key={index} className="flex items-start justify-between gap-4 text-sm"><div className="min-w-0"><p className="text-zinc-300 break-words">{part.nombre}</p><p className="text-xs text-zinc-500 mt-0.5">{part.cantidad} × {money(part.precioUnitario, order.taller.simboloMoneda)}</p></div><span className="font-mono shrink-0">{money(part.cantidad * part.precioUnitario, order.taller.simboloMoneda)}</span></li>)}</ul> : <p className="text-xs text-zinc-500">Sin repuestos asignados.</p>}
                <div className="flex justify-between items-center gap-3 border-t border-white/10 pt-4"><span className="text-sm font-semibold">Total estimado</span><span className="font-mono text-xl font-bold text-teal-300">{money(order.totalEstimado, order.taller.simboloMoneda)}</span></div>
              </section>
            </div>

            <section className="rounded-2xl border border-white/10 bg-[#141a20] p-5 sm:p-6 space-y-4">
              <h2 className="text-sm font-semibold flex items-center gap-2"><ImageIcon className="h-4 w-4 text-teal-400" />Fotos de tu equipo <span className="text-xs text-zinc-500 font-normal">({order.fotosEvidencia.length})</span></h2>
              {order.fotosEvidencia.length ? <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">{order.fotosEvidencia.map((url, index) => <button key={`${index}-${url}`} type="button" onClick={() => onSelectPhoto(url)} aria-label={`Ampliar foto ${index + 1} del equipo`} className="aspect-square overflow-hidden rounded-xl border border-white/10 bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-teal-400"><img src={url} alt={`Foto de evidencia ${index + 1}`} loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover transition-transform hover:scale-105" /></button>)}</div> : <p className="text-sm text-zinc-500">El taller todavía no ha adjuntado fotografías.</p>}
            </section>

            <section className="rounded-2xl border border-white/10 bg-[#141a20] p-5 sm:p-6 space-y-4">
              <h2 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-teal-400" />Entrega y garantía</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div className="flex items-start gap-3"><Clock3 className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" /><div><p className="text-xs text-zinc-500">Fecha de entrega</p><p className="text-sm mt-1">{order.fechaEntrega ? new Date(order.fechaEntrega).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : order.estado === 'Entregado' ? 'Fecha no registrada' : 'Por confirmar'}</p></div></div><div className="flex items-start gap-3"><CheckCircle2 className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" /><div><p className="text-xs text-zinc-500">Garantía de la reparación</p><p className="text-sm mt-1">{order.garantiaDias} días</p></div></div></div>
              {order.taller.politicaGarantiaTexto && <p className="text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed pt-4 border-t border-white/10">{order.taller.politicaGarantiaTexto}</p>}
            </section>

            <div className="rounded-2xl border border-teal-800/40 bg-teal-950/20 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div><h2 className="font-semibold">¿Tienes alguna pregunta?</h2><p className="text-sm text-zinc-400 mt-1">Escríbenos con el folio de tu orden.</p></div>
              {whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="min-h-12 px-4 rounded-xl bg-teal-400 text-zinc-950 font-bold text-sm inline-flex items-center justify-center gap-2"><MessageCircle className="h-5 w-5" />WhatsApp del taller<ArrowUpRight className="h-4 w-4" /></a> : <p className="text-xs text-zinc-500">El teléfono del taller aún no está disponible.</p>}
            </div>
    </>
  );
}

export function PublicOrderTracker({ orderId }: { orderId: string }) {
  const [state, setState] = useState<TrackingState>(() => initialState(orderId));
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const refreshNow = useRef<() => void>(() => {});
  const current = state.orderId === orderId ? state : initialState(orderId);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let refreshQueued = false;
    let request: AbortController | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    setState(initialState(orderId));
    setPhotoUrl(null);
    setLive(false);

    const refresh = async (force = false) => {
      if (!active || (!force && document.visibilityState === 'hidden')) return;
      if (inFlight) { refreshQueued = true; return; }
      inFlight = true;
      setRefreshing(true);
      request = new AbortController();
      const controller = request;
      const timeout = setTimeout(() => controller.abort(), 12_000);
      try {
        const order = await fetchPublicOrderTracking(orderId, supabase, controller.signal);
        if (!active) return;
        setState({ orderId, status: order ? 'ready' : 'notfound', order, error: '', updatedAt: new Date() });
      } catch {
        if (!active) return;
        const message = navigator.onLine === false
          ? 'No tienes conexión. Volveremos a actualizar cuando regreses a internet.'
          : controller.signal.aborted
            ? 'La consulta tardó demasiado. Puedes volver a actualizar en unos momentos.'
            : 'No pudimos actualizar el seguimiento. Inténtalo de nuevo en unos momentos.';
        setState((previous) => previous.orderId === orderId && previous.order
          ? { ...previous, error: message }
          : { orderId, status: 'error', order: null, error: message, updatedAt: null });
      } finally {
        clearTimeout(timeout);
        inFlight = false;
        request = null;
        if (active) {
          setRefreshing(false);
          if (refreshQueued) { refreshQueued = false; void refresh(); }
        }
      }
    };

    refreshNow.current = () => { void refresh(true); };
    void refresh(true);
    if (isValidTrackingOrderId(orderId)) {
      try {
        // Public broadcasts contain only the order id; fetch the sanitized RPC again.
        channel = supabase.channel(`tracking:${orderId}`)
          .on('broadcast', { event: 'order_changed' }, () => { void refresh(); })
          .subscribe((status: string) => {
            if (!active) return;
            setLive(status === 'SUBSCRIBED');
            if (status === 'SUBSCRIBED') void refresh();
          });
      } catch {
        // Polling and focus/online refresh remain available if Realtime is unavailable.
        setLive(false);
      }
    }
    const visibilityChange = () => { if (document.visibilityState !== 'hidden') void refresh(); };
    const sync = () => { void refresh(); };
    const interval = setInterval(sync, 15_000);
    document.addEventListener('visibilitychange', visibilityChange);
    window.addEventListener('focus', sync);
    window.addEventListener('online', sync);
    return () => {
      active = false;
      request?.abort();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', visibilityChange);
      window.removeEventListener('focus', sync);
      window.removeEventListener('online', sync);
      refreshNow.current = () => {};
      if (channel) void Promise.resolve(supabase.removeChannel(channel)).catch(() => {});
    };
  }, [orderId]);

  useEffect(() => {
    if (photoUrl && !current.order?.fotosEvidencia.includes(photoUrl)) setPhotoUrl(null);
  }, [current.order, photoUrl]);

  const order = current.order;
  const visiblePhoto = photoUrl && order?.fotosEvidencia.includes(photoUrl) ? photoUrl : null;
  const workshopName = order?.taller.nombre || 'CelMart';


  return (
    <main className="min-h-dvh bg-[#0d1014] text-zinc-100 font-sans pb-10">
      <header className="border-b border-white/10 bg-[#11161b]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-teal-400 text-zinc-950 flex items-center justify-center"><Wrench className="h-5 w-5" /></div>
            <div className="min-w-0"><p className="font-bold text-lg truncate">{workshopName}</p><p className="text-xs text-zinc-400">Seguimiento de tu reparación</p></div>
          </div>
          <ShieldCheck className="h-6 w-6 text-teal-400 shrink-0" aria-hidden="true" />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-7 space-y-5">
        {current.status === 'loading' && (
          <div role="status" className="rounded-2xl border border-white/10 bg-[#141a20] p-10 text-center space-y-4">
            <LoaderCircle className="h-9 w-9 animate-spin text-teal-400 mx-auto" /><h1 className="text-xl font-semibold">Buscando tu equipo…</h1><p className="text-sm text-zinc-400">Estamos consultando el avance de tu reparación.</p>
          </div>
        )}

        {(current.status === 'notfound' || current.status === 'error') && (
          <div className="rounded-2xl border border-white/10 bg-[#141a20] p-7 sm:p-10 text-center space-y-4">
            <CircleAlert className="h-10 w-10 text-amber-300 mx-auto" />
            <h1 className="text-xl font-semibold">{current.status === 'notfound' ? 'No encontramos esta orden' : 'Seguimiento temporalmente no disponible'}</h1>
            <p role={current.status === 'error' ? 'alert' : 'status'} className="text-sm text-zinc-400 leading-relaxed">{current.status === 'notfound' ? 'Comprueba el enlace o el código impreso en tu ticket de recepción.' : current.error}</p>
            <button type="button" onClick={() => refreshNow.current()} disabled={refreshing} className="min-h-12 px-5 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-400 text-zinc-950 font-semibold disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Volver a consultar</button>
          </div>
        )}

        {order && <PublicTrackingRecord order={order} refreshing={refreshing} live={live} updatedAt={current.updatedAt} error={current.error} onRefresh={() => refreshNow.current()} onSelectPhoto={setPhotoUrl} />}

        <p className="text-center text-[11px] text-zinc-600 py-3">{workshopName} · Cuidamos tu equipo en cada paso.</p>
      </div>
      {visiblePhoto && <PhotoPreview url={visiblePhoto} onClose={() => setPhotoUrl(null)} />}
    </main>
  );
}
