import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import type { AssignedPart, CounterSale, InventoryItem, Order, OrderStatus } from '../src/types';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
const { createElement, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { DeviceDetailDrawer } = await import('../src/components/DeviceDetailDrawer');
const { OrdersTable } = await import('../src/components/OrdersTable');
const { MobileWorkshopView } = await import('../src/components/MobileWorkshopView');
const { InventoryView } = await import('../src/components/InventoryView');
const { QuickSaleModal } = await import('../src/components/QuickSaleModal');
const { initialOrders, initialWorkshopConfig } = await import('../src/data/initialData');

const order = (estado: OrderStatus): Order => ({ ...initialOrders[0], id: 'OS-FINANCIAL', estado, repuestosAsignados: [] });
const inventory: InventoryItem = {
  id: 'battery', nombre: 'Batería', sku: 'BAT-TEST', categoria: 'Baterías', stockActual: 2,
  stockMinimo: 1, costoCompra: 50, precioVenta: 100, compatibilidad: 'Universal', ubicacion: 'A1',
};
const noop = () => {};
const save = async () => {};

async function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  return {
    host,
    async render(element: Parameters<typeof root.render>[0]) { await act(async () => { root.render(element); }); },
    async close() { await act(async () => root.unmount()); host.remove(); },
  };
}
function button(host: HTMLElement, name: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((element) => element.textContent?.trim() === name || element.getAttribute('aria-label') === name);
  assert.ok(found, `Missing button: ${name}`);
  return found;
}
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function input(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}
async function select(element: HTMLSelectElement, value: string) {
  await act(async () => {
    element.value = value;
    element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
}
function drawer(record: Order, items = [inventory], onAssignPart: (id: string, part: AssignedPart) => Promise<void> = save, onRemovePart?: (id: string, partId: string) => Promise<void>) {
  return createElement(DeviceDetailDrawer, {
    order: record, inventory: items, isOpen: true, onClose: noop, onUpdateStatus: save,
    onAddNote: save, onAssignPart, onAddPhoto: save, onPrintTicket: noop, onOpenWhatsApp: noop,
    onPayment: save, onWarranty: save, onRemovePart,
  });
}

test('delivered drawers lock normal status, payment and part assignment even with legacy missing payment', async () => {
  const view = await mount();
  try {
    await view.render(drawer({ ...order('Entregado'), fechaEntrega: new Date().toISOString(), metodoPago: undefined, montoCobrado: undefined }));
    assert.equal(view.host.querySelector<HTMLSelectElement>('[aria-label="Estado de la orden"]')!.disabled, true);
    assert.equal(view.host.querySelector<HTMLSelectElement>('[aria-label="Método de pago"]')!.disabled, true);
    assert.equal(view.host.querySelector<HTMLInputElement>('[aria-label="Importe cobrado"]')!.disabled, true);
    assert.equal(view.host.querySelector<HTMLSelectElement>('[aria-label="Método de pago"]')!.value, '');
    assert.equal(view.host.querySelector<HTMLInputElement>('[aria-label="Importe cobrado"]')!.value, '');
    assert.ok([...view.host.querySelectorAll('option')].some((option) => option.textContent === 'Tarjeta'));
    assert.equal([...view.host.querySelectorAll('button')].some((element) => element.textContent?.trim() === 'Guardar cobro'), false);
    assert.ok(view.host.textContent!.includes('Registrar Reingreso por Garantía'));
    await click(button(view.host, 'Costos & Repuestos (0)'));
    assert.equal(view.host.querySelector<HTMLSelectElement>('[aria-label="Repuesto del inventario"]')!.disabled, true);
    assert.equal(view.host.querySelector<HTMLInputElement>('[aria-label="Cantidad de refacciones"]')!.disabled, true);
    assert.equal(button(view.host, '+ Asignar').disabled, true);
    assert.match(view.host.textContent!, /refacciones y el presupuesto están cerrados/);
  } finally { await view.close(); }
});

test('part assignment validates quantity and rechecks stock changes without losing the selection', async () => {
  const view = await mount();
  const assigned: AssignedPart[] = [];
  const assign = async (_id: string, part: AssignedPart) => { assigned.push(part); };
  try {
    await view.render(drawer(order('En Reparación'), [inventory], assign));
    await click(button(view.host, 'Costos & Repuestos (0)'));
    await select(view.host.querySelector<HTMLSelectElement>('[aria-label="Repuesto del inventario"]')!, inventory.id);
    await input(view.host.querySelector<HTMLInputElement>('[aria-label="Cantidad de refacciones"]')!, '3');
    assert.equal(button(view.host, '+ Asignar').disabled, true);
    assert.match(view.host.querySelector('[role="alert"]')!.textContent!, /Stock insuficiente/);
    await input(view.host.querySelector<HTMLInputElement>('[aria-label="Cantidad de refacciones"]')!, '2');
    await view.render(drawer(order('En Reparación'), [{ ...inventory, stockActual: 0 }], assign));
    assert.match(view.host.querySelector('[role="alert"]')!.textContent!, /Sin existencias/);
    assert.equal(button(view.host, '+ Asignar').disabled, true);
    assert.equal(view.host.querySelector<HTMLSelectElement>('[aria-label="Repuesto del inventario"]')!.value, inventory.id);
    await view.render(drawer(order('En Reparación'), [inventory], assign));
    await click(button(view.host, '+ Asignar'));
    assert.equal(assigned.length, 1);
    assert.equal(assigned[0].cantidad, 2);
    assert.equal(assigned[0].precioUnitario, inventory.precioVenta);
    assert.equal(view.host.querySelector<HTMLInputElement>('[aria-label="Cantidad de refacciones"]')!.value, '1');
  } finally { await view.close(); }
});

test('table delivery only requests the central financial confirmation and never sends a premature WhatsApp', async () => {
  const view = await mount();
  const requested: OrderStatus[] = [];
  let whatsAppCalls = 0;
  try {
    await view.render(createElement(OrdersTable, {
      orders: [order('Listo')], selectedFilter: 'Todos', setSelectedFilter: noop,
      onSelectOrder: noop, onPrintTicket: noop, onOpenWhatsApp: () => { whatsAppCalls++; },
      onUpdateOrderStatus: async (_id, next) => { requested.push(next); },
    }));
    await click(button(view.host, 'Estado de OS-FINANCIAL: Listo'));
    await click(button(view.host, 'Entregado'));
    assert.deepEqual(requested, ['Entregado']);
    assert.equal(whatsAppCalls, 0);
  } finally { await view.close(); }
});

test('table exposes transition failures and cannot reopen or delete delivered history', async () => {
  const view = await mount();
  const props = {
    selectedFilter: 'Todos', setSelectedFilter: noop, onSelectOrder: noop, onPrintTicket: noop, onOpenWhatsApp: noop,
    onUpdateOrderStatus: async () => { throw new Error('La orden cambió en otro equipo.'); },
  };
  try {
    await view.render(createElement(OrdersTable, { ...props, orders: [order('Recibido')] }));
    await click(button(view.host, 'Estado de OS-FINANCIAL: Recibido'));
    assert.equal([...view.host.querySelectorAll('button')].some((element) => element.textContent?.trim() === 'Entregado'), false);
    await click(button(view.host.querySelector<HTMLButtonElement>('[aria-expanded="true"]')!.parentElement!, 'En Diagnóstico'));
    assert.match(view.host.querySelector('[role="alert"]')!.textContent!, /otro equipo/);
    await view.render(createElement(OrdersTable, { ...props, orders: [order('Entregado')] }));
    assert.equal(button(view.host, 'Estado de OS-FINANCIAL: Entregado').disabled, true);
    assert.equal(view.host.querySelector<HTMLButtonElement>('[title="Eliminar Orden de Servicio"]')!.disabled, true);
  } finally { await view.close(); }
});

test('mobile delivery does not claim a completed status before the payment confirmation commits', async () => {
  const view = await mount();
  let requests = 0;
  try {
    await view.render(createElement(MobileWorkshopView, {
      orders: [order('Listo')], searchQuery: '', onSearchChange: noop, onReceiveExpress: noop,
      onSelectOrder: noop, onAddPhoto: save, onAddNote: save, onOpenWhatsApp: noop,
      onUpdateStatus: async () => { requests++; },
    }));
    await click(button(view.host, 'Marcar entregado'));
    assert.equal(requests, 1);
    assert.doesNotMatch(view.host.textContent!, /Estado: Entregado|Comprobante de la última entrega/);
  } finally { await view.close(); }
});

test('removing a part keeps the row on failure, blocks duplicate submits and is absent on delivered orders', async () => {
  const view = await mount();
  const part: AssignedPart = { id: 'assignment-1', sku: inventory.sku, nombre: inventory.nombre, cantidad: 2, precioUnitario: 100 };
  const record = { ...order('En Reparación'), repuestosAsignados: [part] };
  let requests = 0;
  let reject!: (error: Error) => void;
  const remove = async (id: string, partId: string) => {
    assert.equal(id, record.id); assert.equal(partId, part.id);
    requests++;
    if (requests === 1) await new Promise<void>((_resolve, fail) => { reject = fail; });
  };
  try {
    await view.render(drawer(record, [inventory], save, remove));
    await click(button(view.host, 'Costos & Repuestos (1)'));
    const action = button(view.host, `Quitar refacción ${part.nombre} de ${record.id}`);
    await act(async () => { action.click(); action.click(); });
    assert.equal(requests, 1);
    assert.equal(action.disabled, true);
    await act(async () => reject(new Error('La orden cambió. Revisa sus refacciones.')));
    assert.match(view.host.querySelector('[role="alert"]')!.textContent!, /La orden cambió/);
    assert.equal(action.disabled, false);
    assert.match(view.host.querySelector('tbody')!.textContent!, /BAT-TEST/);
    await click(action);
    assert.equal(requests, 2);
    await view.render(drawer({ ...record, estado: 'Entregado' }, [inventory], save, remove));
    assert.equal([...view.host.querySelectorAll('button')].some((element) => element.getAttribute('aria-label')?.startsWith('Quitar refacción')), false);
  } finally { await view.close(); }
});

test('inventory scanner searches reset categories on each external scan and keep the complete table and compact POS action', async () => {
  const view = await mount();
  const cable: InventoryItem = { ...inventory, id: 'cable', nombre: 'Cable USB', sku: 'USB-C', categoria: 'Accesorios' };
  let opened = 0;
  const props = { inventory: [inventory, cable], onUpdateStock: noop, onAddInventoryItem: save, onEditInventoryItem: save, onDeleteInventoryItem: noop, onOpenQuickSale: () => { opened++; } };
  try {
    await view.render(createElement(InventoryView, props));
    await click(button(view.host, 'Baterías'));
    assert.equal(view.host.querySelectorAll('tbody tr').length, 1);
    assert.doesNotMatch(view.host.querySelector('tbody')!.textContent!, /USB-C/);
    await view.render(createElement(InventoryView, { ...props, searchQuery: 'USB-C', searchRevision: 1 }));
    assert.equal(view.host.querySelector<HTMLInputElement>('[placeholder="Buscar SKU, código de barras o escanear..."]')!.value, 'USB-C');
    assert.match(view.host.querySelector('tbody')!.textContent!, /USB-C/);
    await click(button(view.host, 'Baterías'));
    await view.render(createElement(InventoryView, { ...props, searchQuery: 'USB-C', searchRevision: 2 }));
    assert.match(view.host.querySelector('tbody')!.textContent!, /USB-C/);
    assert.equal(view.host.querySelectorAll('thead th').length, 7);
    await click(button(view.host, '⚡ Venta Rápida Mostrador'));
    assert.equal(opened, 1);
    assert.doesNotMatch(button(view.host, '⚡ Venta Rápida Mostrador').className, /w-full/);
  } finally { await view.close(); }
});

test('counter sale validates stock, locks duplicates and close actions, keeps rejected drafts and prints only an acknowledged sale', async (t) => {
  const view = await mount();
  const config = { ...initialWorkshopConfig, anchoTicket: '58mm' as const };
  const zeroStock = { ...inventory, id: 'empty', sku: 'EMPTY', nombre: 'Agotado', stockActual: 0 };
  const sold: CounterSale = { id: 'VTA-TEST', itemId: inventory.id, sku: inventory.sku, nombre: inventory.nombre, cantidad: 2, precioUnitario: 110, costoUnitario: 50, metodoPago: 'Tarjeta', total: 220, createdAt: '2026-11-03T12:00:00Z', pendingSync: true };
  let closeCalls = 0, saleCalls = 0, prints = 0;
  let reject!: (error: Error) => void;
  t.mock.method(dom.window, 'print', () => { prints++; });
  const onSale = async (id: string, quantity: number, method: string) => {
    assert.equal(id, inventory.id); assert.equal(quantity, 2); assert.equal(method, 'Tarjeta');
    saleCalls++;
    if (saleCalls === 1) await new Promise<void>((_resolve, fail) => { reject = fail; });
    return sold;
  };
  const props = { isOpen: true, inventory: [inventory, zeroStock], config, onClose: () => { closeCalls++; }, onSale };
  try {
    await view.render(createElement(QuickSaleModal, props));
    assert.equal(document.activeElement?.getAttribute('aria-label'), 'Buscar producto por nombre o SKU');
    assert.doesNotMatch(view.host.textContent!, /EMPTY|Agotado/);
    await input(view.host.querySelector<HTMLInputElement>('[aria-label="Buscar producto por nombre o SKU"]')!, 'bat-test');
    await click(button(view.host, 'Seleccionar BAT-TEST Batería'));
    await input(view.host.querySelector<HTMLInputElement>('[aria-label="Cantidad de venta"]')!, '3');
    assert.match(view.host.querySelector('[role="alert"]')!.textContent!, /Stock insuficiente/);
    assert.equal(view.host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled, true);
    await input(view.host.querySelector<HTMLInputElement>('[aria-label="Cantidad de venta"]')!, '2');
    await click(button(view.host, '💳 Tarjeta'));
    await act(async () => {
      view.host.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      view.host.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });
    assert.equal(saleCalls, 1);
    assert.equal(button(view.host, 'Cerrar venta rápida').disabled, true);
    assert.equal(document.activeElement?.getAttribute('role'), 'dialog');
    await act(async () => view.host.querySelector('[role="dialog"]')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })));
    assert.equal(closeCalls, 0);
    assert.equal(prints, 0);
    assert.equal(view.host.querySelector('#counter-sale-ticket'), null);
    await act(async () => reject(new Error('Caja cerrada, revisa antes de cobrar.')));
    assert.match(view.host.querySelector('[role="alert"]')!.textContent!, /Caja cerrada/);
    assert.equal(view.host.querySelector<HTMLInputElement>('[aria-label="Cantidad de venta"]')!.value, '2');
    assert.equal(view.host.querySelector<HTMLInputElement>('[aria-label="Buscar producto por nombre o SKU"]')!.value, 'bat-test');
    await click(button(view.host, 'Cobrar $200.00'));
    assert.equal(saleCalls, 2);
    const ticket = view.host.querySelector('#counter-sale-ticket');
    assert.ok(ticket);
    assert.equal(ticket.getAttribute('data-paper-width'), '58mm');
    assert.match(ticket.textContent!, /TOTAL:\$220\.00 MXN/);
    assert.match(ticket.textContent!, /Método: Tarjeta/);
    assert.match(ticket.textContent!, /COPIA LOCAL · PENDIENTE DE SINCRONIZAR/);
    assert.doesNotMatch(ticket.textContent!, /costo|utilidad|garantía|PIN/i);
    assert.equal(prints, 0);
    await click(button(view.host, 'Imprimir ticket · 58mm'));
    assert.equal(prints, 1);
    const confirmed = { ...sold, pendingSync: false, createdAt: '2026-11-04T12:00:00Z' };
    await view.render(createElement(QuickSaleModal, { ...props, saleUpdates: [confirmed] }));
    assert.equal(view.host.querySelector('#counter-sale-ticket'), ticket);
    assert.doesNotMatch(ticket.textContent!, /COPIA LOCAL|PENDIENTE DE SINCRONIZAR/);
    assert.ok(ticket.textContent!.includes(new Date(confirmed.createdAt).toLocaleString('es-MX')));
    assert.equal(prints, 1);
    await select(view.host.querySelector<HTMLSelectElement>('[aria-label="Ancho del ticket de venta"]')!, '80mm');
    assert.equal(ticket.getAttribute('data-paper-width'), '80mm');
    await click(button(view.host, 'Nueva venta'));
    assert.equal(view.host.querySelector('#counter-sale-ticket'), null);
    assert.equal(document.activeElement?.getAttribute('aria-label'), 'Buscar producto por nombre o SKU');
    await click(button(view.host, 'Cerrar venta rápida'));
    assert.equal(closeCalls, 1);
  } finally { await view.close(); }
});

test('counter sale rechecks live stock before charging and supports SKU Enter without an accidental sale', async () => {
  const view = await mount();
  let calls = 0;
  const props = { isOpen: true, config: initialWorkshopConfig, onClose: noop, onSale: async () => { calls++; throw new Error('Should not charge'); } };
  try {
    await view.render(createElement(QuickSaleModal, { ...props, inventory: [inventory] }));
    const field = view.host.querySelector<HTMLInputElement>('[aria-label="Buscar producto por nombre o SKU"]')!;
    await input(field, inventory.sku);
    await act(async () => field.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })));
    assert.equal(document.activeElement?.getAttribute('aria-label'), 'Cantidad de venta');
    assert.equal(calls, 0);
    await view.render(createElement(QuickSaleModal, { ...props, inventory: [{ ...inventory, stockActual: 0 }] }));
    assert.match(view.host.querySelector('[role="alert"]')!.textContent!, /Sin existencias/);
    assert.equal(view.host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled, true);
    await act(async () => view.host.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(calls, 0);
  } finally { await view.close(); }
});
