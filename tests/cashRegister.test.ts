import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
});
for (const key of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Event']) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: (dom.window as unknown as Record<string, unknown>)[key],
  });
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { CashRegisterView } = await import('../src/components/CashRegisterView');
const { supabase } = await import('../src/lib/supabase');
const { offlineStore } = await import('../src/lib/offlineRepository');
const { initialInventoryItems } = await import('../src/data/initialData');

async function settle(action?: () => void | Promise<unknown>) {
  await React.act(async () => {
    await action?.();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

test('cash view refreshes confirmed card deliveries and Kardex, blocks pending local work and cleans subscriptions', async (t) => {
  const spy = t.mock.method(supabase, 'rpc');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let quickSales = 0;
  await settle(() => root.render(React.createElement(CashRegisterView, { onOpenQuickSale: () => { quickSales++; } })));
  try {
    const quickSale = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === '⚡ Venta Rápida Mostrador');
    assert.ok(quickSale);
    assert.ok(quickSale.classList.contains('text-xs'));
    assert.equal(quickSale.classList.contains('w-full'), false);
    await settle(() => quickSale.click());
    assert.equal(quickSales, 1);
    assert.match(host.textContent || '', /Tarjeta: \$0\.00/);
    const ticket = () => host.querySelector('#cash-ticket');
    assert.ok(ticket()?.classList.contains('bg-[#161619]'));
    await settle(async () => {
      const result = await supabase.from('ordenes').update({
        estado: 'Entregado', metodo_pago: 'Tarjeta', monto_cobrado: 87.5,
      }).eq('id', 'OS-2403');
      assert.equal(result.error, null);
    });
    assert.match(ticket()?.textContent || '', /Tarjeta: \$87\.50/);

    await settle(async () => {
      const result = await supabase.rpc('asignar_repuesto', {
        p_order_id: 'OS-2401', p_sku: initialInventoryItems[0].sku, p_cantidad: 1,
      });
      assert.equal(result.error, null);
    });
    const consumed = initialInventoryItems[0].costoCompra.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    assert.ok(ticket()?.textContent?.includes(`Repuestos consumidos: ${consumed}`));

    const saleItem = initialInventoryItems[1];
    const orderCount = (await supabase.from('ordenes').select('*')).data.length;
    await settle(async () => {
      const result = await supabase.rpc('apply_offline_operation', {
        p_operation_id: crypto.randomUUID(), p_owner_id: 'mock-user-1',
        p_command: { kind: 'sale', sale: {
          id: crypto.randomUUID(), itemId: saleItem.id, sku: saleItem.sku,
          nombre: saleItem.nombre, cantidad: 2, precioUnitario: saleItem.precioVenta,
          costoUnitario: saleItem.costoCompra, metodoPago: 'Efectivo',
          total: 2 * saleItem.precioVenta, createdAt: new Date().toISOString(),
        } },
      });
      assert.equal(result.error, null);
    });
    const money = (amount: number) => amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    assert.ok(ticket()?.textContent?.includes(`Efectivo: ${money(2 * saleItem.precioVenta)}`));
    assert.ok(ticket()?.textContent?.includes(`Repuestos consumidos: ${money(initialInventoryItems[0].costoCompra + 2 * saleItem.costoCompra)}`));
    assert.equal((await supabase.from('ordenes').select('*')).data.length, orderCount);

    await settle(async () => {
      await offlineStore.bindOwner('cash-qa');
      await offlineStore.enqueue({ kind: 'createInventory', item: { ...initialInventoryItems[0], id: 'pending-cash-item', sku: 'PENDING-CASH' } });
    });
    assert.equal(ticket(), null);
    assert.match(host.querySelector('[role=alert]')?.textContent || '', /Sincroniza los cambios/);
    assert.equal(host.querySelector<HTMLButtonElement>('form button')?.disabled, true);

    await settle(() => {
      localStorage.clear();
      offlineStore.reload();
    });
    assert.match(ticket()?.textContent || '', /Tarjeta: \$87\.50/);
  } finally {
    await settle(() => root.unmount());
    host.remove();
  }
  const calls = spy.mock.callCount();
  await supabase.from('ordenes').update({ ubicacion_fisica: 'Después de desmontar la vista' }).eq('id', 'OS-2401');
  window.dispatchEvent(new Event('focus'));
  offlineStore.reload();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(spy.mock.callCount(), calls);
});
