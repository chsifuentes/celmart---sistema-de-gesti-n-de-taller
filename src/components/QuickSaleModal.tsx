import React, { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, Printer, Search, X } from 'lucide-react';
import type { CounterSale, InventoryItem, PaymentMethod, WorkshopConfig } from '../types';
import { PAYMENT_METHODS } from '../lib/operations';

interface QuickSaleModalProps {
  inventory: InventoryItem[];
  config: WorkshopConfig;
  isOpen: boolean;
  onClose: () => void;
  onSale: (itemId: string, quantity: number, method: PaymentMethod) => Promise<CounterSale>;
  saleUpdates?: CounterSale[];
}

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();

/** The counter transaction and its thermal proof stay together as one workflow. */
export function QuickSaleModal({ inventory, config, isOpen, onClose, onSale, saleUpdates }: QuickSaleModalProps) {
  const [query, setQuery] = useState('');
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [method, setMethod] = useState<PaymentMethod>('Efectivo');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [storedSale, setSale] = useState<CounterSale | null>(null);
  const sale = storedSale ? saleUpdates?.find((item) => item.id === storedSale.id) ?? storedSale : null;
  const [paper, setPaper] = useState(config.anchoTicket);
  const saving = useRef(false);
  const generation = useRef(0);
  const dialog = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const quantityInput = useRef<HTMLInputElement>(null);
  const printButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    generation.current++;
    if (!isOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery(''); setItemId(''); setQuantity('1'); setMethod('Efectivo');
    setBusy(saving.current); setError(''); setSale(null); setPaper(config.anchoTicket);
    search.current?.focus();
    return () => {
      generation.current++;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (sale) printButton.current?.focus();
    else if (isOpen) search.current?.focus();
  }, [sale?.id, isOpen]);

  useEffect(() => { if (busy) dialog.current?.focus(); }, [busy]);
  useEffect(() => { if (itemId) quantityInput.current?.focus(); }, [itemId]);

  if (!isOpen) return null;
  const term = normalize(query);
  const matches = inventory.filter((item) => item.stockActual > 0 && (!term || normalize(`${item.nombre} ${item.sku}`).includes(term)));
  const selected = inventory.find((item) => item.id === itemId);
  const count = Number(quantity);
  const quantityError = itemId && (!selected || selected.stockActual <= 0)
    ? 'Sin existencias. El producto ya no está disponible.'
    : selected && (!Number.isInteger(count) || count <= 0)
      ? 'Indica una cantidad entera mayor que cero.'
      : selected && count > selected.stockActual
        ? `Stock insuficiente: hay ${selected.stockActual} disponibles.`
        : '';
  const total = selected && Number.isInteger(count) && count > 0 ? Math.round(selected.precioVenta * count * 100) / 100 : 0;
  const money = (amount: number) => `${config.simboloMoneda || '$'}${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const close = () => { if (!saving.current) onClose(); };
  const choose = (item: InventoryItem) => { if (saving.current) return; setItemId(item.id); setQuantity('1'); setError(''); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving.current || sale) return;
    if (!selected || quantityError) { setError(quantityError || 'Selecciona un producto con existencias.'); return; }
    saving.current = true; setBusy(true); setError('');
    const version = generation.current;
    try {
      const saved = await onSale(selected.id, count, method);
      if (!saved?.id) throw new Error('No se confirmó la venta. Revisa los cambios pendientes antes de intentar nuevamente.');
      if (version === generation.current) setSale(saved);
    } catch (cause) {
      if (version === generation.current) setError(cause instanceof Error ? cause.message : 'No se pudo registrar la venta. Inténtalo de nuevo.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  return <div className="quick-sale-modal fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-3 sm:p-4" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div ref={dialog} role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="quick-sale-title" className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-lg border border-zinc-800/80 bg-[#161619] text-xs text-zinc-200 shadow-xl outline-none" onKeyDown={(event) => {
      if (event.key === 'Escape') { event.stopPropagation(); close(); }
      if (event.key === 'Tab') {
        const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)');
        const first = controls?.[0], last = controls?.[controls.length - 1];
        if (!first) { event.preventDefault(); dialog.current?.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800/80 bg-[#111114] px-4 py-3">
        <h2 id="quick-sale-title" className="font-semibold text-zinc-100">⚡ Venta Rápida Mostrador</h2>
        <button type="button" onClick={close} disabled={busy} aria-label="Cerrar venta rápida" className="rounded p-1 text-zinc-500 hover:text-zinc-100 disabled:opacity-40"><X className="h-4 w-4"/></button>
      </div>
      {!sale ? <form onSubmit={submit} className="space-y-3 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500"/>
          <input ref={search} type="search" aria-label="Buscar producto por nombre o SKU" placeholder="Nombre, SKU o código de barras…" value={query} disabled={busy} onChange={(event) => { setQuery(event.target.value); setItemId(''); setError(''); }} onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const match = matches.find((item) => normalize(item.sku) === term) || (matches.length === 1 ? matches[0] : null);
            if (match) { choose(match); quantityInput.current?.focus(); }
          }} className="w-full rounded-md border border-zinc-800/80 bg-[#1c1c20] py-2 pl-9 pr-3 text-xs text-zinc-100 outline-none focus:border-zinc-700 disabled:opacity-50"/>
        </div>
        <div aria-label="Productos con existencias" className="max-h-44 overflow-y-auto rounded-md border border-zinc-800/80 bg-[#111114] divide-y divide-zinc-800/80">
          {matches.length ? matches.map((item) => <button key={item.id} type="button" disabled={busy} aria-label={`Seleccionar ${item.sku} ${item.nombre}`} aria-pressed={itemId === item.id} onClick={() => choose(item)} className={`flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left hover:bg-[#1c1c20] disabled:opacity-50 ${itemId === item.id ? 'bg-[#1c1c20]' : ''}`}>
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-zinc-200">{item.nombre}</span><span className="block truncate font-mono text-[10px] text-zinc-500">{item.sku} · Stock {item.stockActual}</span></span>
            <span className="shrink-0 font-mono text-[11px] text-zinc-300">{money(item.precioVenta)}</span>
            {itemId === item.id && <Check className="h-3.5 w-3.5 shrink-0 text-zinc-300"/>}
          </button>) : <p className="px-3 py-4 text-[11px] text-zinc-500">Sin productos con existencias para esta búsqueda.</p>}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="block text-[11px] text-zinc-400">Cantidad<input ref={quantityInput} aria-label="Cantidad de venta" type="number" min="1" step="1" value={quantity} required disabled={busy || !itemId} onChange={(event) => { setQuantity(event.target.value); setError(''); }} className="mt-1 block w-20 rounded-md border border-zinc-800/80 bg-[#1c1c20] px-2.5 py-2 font-mono text-xs text-zinc-100 outline-none focus:border-zinc-700 disabled:opacity-50"/></label>
          <p className="text-right text-[11px] text-zinc-500">Total a cobrar<span className="mt-1 block font-mono text-base font-semibold text-zinc-100">{money(total)} <span className="text-[10px] font-normal text-zinc-500">MXN</span></span></p>
        </div>
        <div role="group" aria-label="Método de pago de la venta" className="flex gap-1.5">{PAYMENT_METHODS.map((value, index) => <button key={value} type="button" disabled={busy} aria-pressed={method === value} onClick={() => setMethod(value)} className={`flex-1 rounded-md border px-2 py-2 text-[11px] disabled:opacity-50 ${method === value ? 'border-zinc-600 bg-[#1c1c20] text-zinc-100' : 'border-zinc-800/80 text-zinc-500 hover:border-zinc-700'}`}>{['💵', '🏦', '💳'][index]} {value}</button>)}</div>
        {(error || quantityError) && <p role="alert" className="text-[11px] text-rose-300">{error || quantityError}</p>}
        <div className="flex justify-end border-t border-zinc-800/80 pt-3"><button type="submit" disabled={busy || !selected || !!quantityError} className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-3.5 py-2 text-xs font-semibold text-zinc-950 hover:bg-white disabled:opacity-40">{busy && <LoaderCircle className="h-3.5 w-3.5 animate-spin"/>}{busy ? 'Registrando…' : `Cobrar ${money(total)}`}</button></div>
      </form> : <div className="space-y-3 p-4">
        <p role="status" className="text-[11px] text-zinc-300">{sale.pendingSync ? 'Venta guardada en este dispositivo; pendiente de sincronizar.' : 'Venta registrada.'} <span className="font-mono text-zinc-500">{sale.id}</span></p>
        <div className="flex items-center justify-between gap-3"><label className="text-[11px] text-zinc-500">Ticket <select aria-label="Ancho del ticket de venta" value={paper} onChange={(event) => setPaper(event.target.value as WorkshopConfig['anchoTicket'])} className="ml-2 rounded-md border border-zinc-800/80 bg-[#1c1c20] px-2 py-1.5 text-xs text-zinc-300"><option>58mm</option><option>80mm</option></select></label><button type="button" onClick={() => { setSale(null); setQuery(''); setItemId(''); setQuantity('1'); setError(''); }} className="rounded-md border border-zinc-800/80 bg-[#1c1c20] px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-700">Nueva venta</button></div>
        <div className="flex justify-center overflow-x-auto rounded-md bg-[#0c0c0e] p-3">
          <div id="counter-sale-ticket" data-paper-width={paper} style={{ width: paper, maxWidth: '100%', padding: '3mm' }} className="shrink-0 break-words bg-white font-mono text-[10px] leading-snug text-black">
            <p className="text-center text-sm font-bold">{config.nombreTaller}</p>
            <p className="text-center text-[9px]">{config.direccion}</p>
            <p className="text-center text-[9px]">{config.telefono}</p>
            <div className="my-2 border-y border-dashed border-black py-2"><p className="text-center font-bold">VENTA DE MOSTRADOR</p><p>Folio: {sale.id}</p><p>Fecha: {Number.isFinite(Date.parse(sale.createdAt)) ? new Date(sale.createdAt).toLocaleString('es-MX') : 'Sin registrar'}</p></div>
            <p className="font-bold">{sale.nombre}</p><p>SKU: {sale.sku}</p><div className="mt-1 flex justify-between gap-2"><span>{sale.cantidad} × {money(sale.precioUnitario)}</span><span>{money(sale.total)}</span></div>
            <div className="mt-2 flex justify-between gap-2 border-t border-dashed border-black pt-2 font-bold"><span>TOTAL:</span><span>{money(sale.total)} MXN</span></div><p className="mt-1">Método: {sale.metodoPago}</p>
            {sale.pendingSync && <p className="mt-2 text-center text-[9px] font-bold">COPIA LOCAL · PENDIENTE DE SINCRONIZAR</p>}
          </div>
        </div>
        {error && <p role="alert" className="text-[11px] text-rose-300">{error}</p>}
        <div className="flex justify-end"><button ref={printButton} type="button" onClick={() => { try { window.print(); } catch { setError('No se pudo abrir la impresión. Inténtalo de nuevo.'); } }} className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-3.5 py-2 text-xs font-semibold text-zinc-950 hover:bg-white"><Printer className="h-3.5 w-3.5"/>Imprimir ticket · {paper}</button></div>
        <style>{`@media print{@page{size:${paper} auto;margin:0}html,body,#root{height:auto!important;overflow:visible!important}body *{visibility:hidden!important}#counter-sale-ticket,#counter-sale-ticket *{visibility:visible!important;color:black!important}.quick-sale-modal{position:absolute!important;inset:0!important;display:block!important;background:white!important}#counter-sale-ticket{position:absolute!important;top:0!important;left:0!important;width:${paper}!important;max-width:none!important;box-sizing:border-box!important;margin:0!important;padding:3mm!important;background:white!important;font:10px monospace!important}}`}</style>
      </div>}
    </div>
  </div>;
}
