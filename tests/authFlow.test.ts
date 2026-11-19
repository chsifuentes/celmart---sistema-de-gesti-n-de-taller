import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
for (const key of [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLSelectElement',
  'Node',
  'Event',
  'MouseEvent',
])
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: (dom.window as unknown as Record<string, unknown>)[key],
  });
Object.defineProperty(dom.window, 'innerWidth', {
  configurable: true,
  value: 1366,
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { default: App } = await import('../src/App');
const { supabase } = await import('../src/lib/supabase');
const { offlineStore, rememberOfflineIdentity } =
  await import('../src/lib/offlineRepository');
const { PublicOrderTracker } =
  await import('../src/components/PublicOrderTracker');
const { initialOrders } = await import('../src/data/initialData');
const { orderToRow } = await import('../src/lib/orderRepository');
const { workshopDate } = await import('../src/lib/operations');

async function flush(action?: () => void, ms = 30) {
  await React.act(async () => {
    action?.();
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
async function reset() {
  await supabase.auth.signOut();
  rememberOfflineIdentity('mock-user-1');
  localStorage.clear();
  sessionStorage.clear();
  offlineStore.reload();
  Object.defineProperty(dom.window.navigator, 'onLine', {
    configurable: true,
    value: true,
  });
}
async function mount(Component = App) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await flush(() => root.render(React.createElement(Component)));
  return {
    host,
    async close() {
      await flush(() => root.unmount());
      host.remove();
    },
  };
}
async function type(host: HTMLElement, selector: string, value: string) {
  const el = host.querySelector<HTMLInputElement>(selector);
  assert.ok(el, selector);
  await flush(() => {
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      'value'
    )!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function login(host: HTMLElement) {
  await type(host, 'input[type=email]', 'qa@example.invalid');
  await type(host, 'input[type=password]', 'local-test-only');
  await flush(
    () =>
      host
        .querySelector('form')!
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true })
        ),
    80
  );
}

test('an old identity and unflagged mock token cannot bypass the mandatory LoginView', async () => {
  await reset();
  localStorage.setItem(
    'celmart_offline_identity',
    JSON.stringify({ userId: 'mock-user-1' })
  );
  localStorage.setItem(
    'celmart_mock_session',
    JSON.stringify({
      access_token: 'mock-token',
      user: { id: 'mock-user-1', email: 'old@example.invalid' },
    })
  );
  assert.equal((await supabase.auth.getSession()).data.session, null);
  const ui = await mount();
  try {
    assert.ok(ui.host.querySelector('input[type=password]'));
    assert.equal(ui.host.querySelector('header'), null);
    assert.equal(ui.host.querySelector('#metric-in-shop'), null);
  } finally {
    await ui.close();
  }
});

test('a deferred session lookup keeps private content hidden until verification completes', async (t) => {
  await reset();
  await supabase.auth.signInWithPassword({
    email: 'qa@example.invalid',
    password: 'test',
  });
  const valid = await supabase.auth.getSession();
  let resolve!: (value: typeof valid) => void;
  t.mock.method(
    supabase.auth,
    'getSession',
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const ui = await mount();
  try {
    assert.ok(ui.host.querySelector('input[type=password]'));
    assert.equal(ui.host.querySelector('header'), null);
    await flush(() => resolve(valid), 90);
    assert.ok(ui.host.querySelector('#metric-in-shop'));
  } finally {
    await ui.close();
  }
});

test('getSession rejection never uses an offline identity as authentication', async (t) => {
  await reset();
  localStorage.setItem(
    'celmart_offline_identity',
    JSON.stringify({ userId: 'mock-user-1' })
  );
  Object.defineProperty(dom.window.navigator, 'onLine', {
    configurable: true,
    value: false,
  });
  t.mock.method(supabase.auth, 'getSession', async () => {
    throw new TypeError('Failed to fetch');
  });
  const ui = await mount();
  try {
    assert.ok(ui.host.querySelector('input[type=password]'));
    assert.equal(ui.host.querySelector('header'), null);
  } finally {
    await ui.close();
  }
});

test('a session verification timeout keeps the login guard closed', async (t) => {
  await reset();
  localStorage.setItem(
    'celmart_offline_identity',
    JSON.stringify({ userId: 'mock-user-1' })
  );
  t.mock.method(supabase.auth, 'getSession', async () => {
    throw new DOMException('Tiempo agotado', 'TimeoutError');
  });
  const ui = await mount();
  try {
    assert.ok(ui.host.querySelector('input[type=password]'));
    assert.equal(ui.host.querySelector('header'), null);
  } finally {
    await ui.close();
  }
});

test('explicit login unlocks the app; a late boot result cannot log out that newer session', async (t) => {
  await reset();
  const original = supabase.auth.getSession.bind(supabase.auth);
  let resolve!: (value: unknown) => void;
  let calls = 0;
  t.mock.method(supabase.auth, 'getSession', () =>
    ++calls === 1
      ? new Promise((done) => {
          resolve = done;
        })
      : original()
  );
  const ui = await mount();
  try {
    await login(ui.host);
    assert.ok(ui.host.querySelector('#metric-in-shop'));
    assert.equal(localStorage.getItem('celmart_mock_login_explicit'), '1');
    await flush(() => resolve({ data: { session: null }, error: null }));
    assert.ok(ui.host.querySelector('#metric-in-shop'));
  } finally {
    await ui.close();
  }
});

test('visible Lock returns immediately to LoginView, clears session flags, preserves pending work and stays locked after reload', async (t) => {
  await reset();
  const ui = await mount();
  let reloaded: Awaited<ReturnType<typeof mount>> | undefined;
  try {
    await login(ui.host);
    assert.ok(ui.host.querySelector('header #btn-lock-session'));
    Object.defineProperty(dom.window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    const order = offlineStore.getSnapshot().data.orders[0];
    assert.ok(order);
    await flush(() => {
      void offlineStore.enqueue({
        kind: 'note',
        orderId: order.id,
        note: {
          id: 'keep-on-logout',
          autor: 'QA',
          contenido: 'Pendiente',
          fecha: 'Ahora',
        },
      });
    });
    const durable = localStorage.getItem('celmart_sync_queue');
    const original = supabase.auth.signOut.bind(supabase.auth);
    let finish!: () => void;
    let requests = 0;
    t.mock.method(supabase.auth, 'signOut', async () => {
      requests++;
      await original();
      return new Promise((done) => {
        finish = () => done({ error: null });
      });
    });
    await flush(() =>
      ui.host.querySelector<HTMLButtonElement>('#btn-lock-session')!.click()
    );
    assert.ok(ui.host.querySelector('input[type=password]'));
    assert.equal(ui.host.querySelector('header'), null);
    assert.equal(requests, 1);
    assert.equal(localStorage.getItem('celmart_mock_login_explicit'), null);
    assert.equal(localStorage.getItem('celmart_mock_session'), null);
    assert.equal(localStorage.getItem('celmart_offline_identity'), null);
    assert.equal(localStorage.getItem('celmart_sync_queue'), durable);
    await flush(() => finish());
    await ui.close();
    reloaded = await mount();
    assert.ok(reloaded.host.querySelector('input[type=password]'));
    assert.equal(reloaded.host.querySelector('header'), null);
  } finally {
    if (reloaded) await reloaded.close();
    else await ui.close();
  }
});

test('a late boot session cannot reopen the workshop after the Lock was pressed', async (t) => {
  await reset();
  const original = supabase.auth.getSession.bind(supabase.auth);
  let resolve!: (value: unknown) => void;
  let calls = 0;
  t.mock.method(supabase.auth, 'getSession', () =>
    ++calls === 1
      ? new Promise((done) => {
          resolve = done;
        })
      : original()
  );
  const ui = await mount();
  try {
    await login(ui.host);
    const oldSession = await original();
    assert.ok(ui.host.querySelector('header'));
    await flush(() =>
      ui.host.querySelector<HTMLButtonElement>('#btn-lock-session')!.click()
    );
    await flush(() => resolve(oldSession));
    assert.ok(ui.host.querySelector('input[type=password]'));
    assert.equal(ui.host.querySelector('header'), null);
  } finally {
    await ui.close();
  }
});

test('login failure remains in the form and does not create an explicit flag', async (t) => {
  await reset();
  t.mock.method(supabase.auth, 'signInWithPassword', async () => ({
    data: { session: null },
    error: { message: 'Invalid login' },
  }));
  const ui = await mount();
  try {
    await login(ui.host);
    assert.ok(ui.host.querySelector('input[type=password]'));
    assert.match(ui.host.textContent!, /Credenciales incorrectas/);
    assert.equal(localStorage.getItem('celmart_mock_login_explicit'), null);
  } finally {
    await ui.close();
  }
});

test('public tracker renders without consulting authentication and entry routing keeps it separate', async (t) => {
  await reset();
  let authCalls = 0;
  t.mock.method(supabase.auth, 'getSession', async () => {
    authCalls++;
    throw new Error('Public tracking must not authenticate');
  });
  const source = await readFile(
    new URL('../src/main.tsx', import.meta.url),
    'utf8'
  );
  assert.match(
    source,
    /trackingId !== null \? <PublicOrderTracker orderId=\{trackingId\} \/> : <App \/>/
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await flush(
      () =>
        root.render(
          React.createElement(PublicOrderTracker, { orderId: 'OS-2401' })
        ),
      90
    );
    assert.equal(authCalls, 0);
    assert.equal(host.querySelector('input[type=password]'), null);
    assert.match(host.textContent!, /OS-2401/);
  } finally {
    await flush(() => root.unmount());
    host.remove();
  }
});

function actionButton(host: HTMLElement, name: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((button) =>
    button.getAttribute('aria-label') === name || button.textContent?.trim() === name
  );
  assert.ok(found, `Missing action: ${name}`);
  return found;
}
async function seedReadyOrder(id: string) {
  const result = await supabase.from('ordenes').insert({
    ...orderToRow({
      ...initialOrders[0], id, estado: 'Listo', costoManoObra: 500, totalEstimado: 500,
      repuestosAsignados: [], garantiaDias: 90, fechaEntrega: undefined,
      cliente: { nombre: 'Cliente QA', telefono: '5550001234' },
    }),
    metodo_pago: null, monto_cobrado: null,
  });
  assert.equal(result.error, null);
}
async function requestTableDelivery(host: HTMLElement, id: string) {
  await flush(() => actionButton(host, `Estado de ${id}: Listo`).click());
  const menu = host.querySelector<HTMLButtonElement>(`[aria-label="Estado de ${id}: Listo"]`)!.parentElement!;
  await flush(() => actionButton(menu, 'Entregado').click());
  const dialog = host.querySelector<HTMLDivElement>('[role="dialog"][aria-labelledby="delivery-title"]');
  assert.ok(dialog, 'Delivery payment confirmation must open');
  return dialog;
}
function isDeliveryRpc(args: Parameters<typeof supabase.rpc>) {
  return args[0] === 'apply_offline_operation' &&
    (args[1] as { p_command?: { kind?: string } } | undefined)?.p_command?.kind === 'delivery';
}

test('real App delivery requires confirmation, saves discounted card payment exactly once and prints the final guarantee', async (t) => {
  await reset();
  const id = 'OS-94101';
  await seedReadyOrder(id);
  const baseline = await supabase.rpc('resumen_caja', { p_fecha: workshopDate() });
  assert.equal(baseline.error, null);
  let prints = 0;
  t.mock.method(dom.window, 'print', () => { prints++; });
  const ui = await mount();
  try {
    await login(ui.host);
    let dialog = await requestTableDelivery(ui.host, id);
    assert.equal(dialog.querySelector<HTMLInputElement>('[aria-label="Total a Cobrar"]')!.value, '500');
    assert.equal((await supabase.from('ordenes').select('*').eq('id', id).single()).data.estado, 'Listo');
    assert.equal(offlineStore.getSnapshot().pending, 0);
    await flush(() => actionButton(dialog, 'Cerrar confirmación de entrega').click());
    assert.equal(ui.host.querySelector('[aria-labelledby="delivery-title"]'), null);
    const canceled = (await supabase.from('ordenes').select('*').eq('id', id).single()).data;
    assert.equal(canceled.estado, 'Listo');
    assert.equal(canceled.metodo_pago, null);
    assert.equal(canceled.monto_cobrado, null);
    assert.equal(prints, 0);

    dialog = await requestTableDelivery(ui.host, id);
    await type(dialog, '[aria-label="Total a Cobrar"]', '425.50');
    await flush(() => actionButton(dialog, '💳 Tarjeta').click());
    const original = supabase.rpc.bind(supabase);
    let deliveries = 0;
    t.mock.method(supabase, 'rpc', (...args: Parameters<typeof supabase.rpc>) => {
      if (isDeliveryRpc(args)) deliveries++;
      return original(...args);
    });
    await flush(() => {
      const form = dialog.querySelector('form')!;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }, 130);
    await flush(undefined, 40);
    const saved = (await supabase.from('ordenes').select('*').eq('id', id).single()).data;
    assert.equal(deliveries, 1);
    assert.equal(saved.estado, 'Entregado');
    assert.equal(saved.metodo_pago, 'Tarjeta');
    assert.equal(saved.monto_cobrado, 425.5);
    assert.ok(Number.isFinite(Date.parse(saved.entregado_at)));
    assert.equal(offlineStore.getSnapshot().pending, 0);
    assert.equal(ui.host.querySelector('[aria-labelledby="delivery-title"]'), null);
    assert.equal(prints, 1);
    const receipt = ui.host.querySelector('#thermal-receipt-printable');
    assert.ok(receipt);
    assert.match(receipt.textContent!, /TOTAL DEL SERVICIO:\$425\.50 MXN/);
    assert.match(receipt.textContent!, /Descuento final:−\$74\.50/);
    assert.match(receipt.textContent!, /Cobrado: \$425\.50 · Tarjeta/);
    assert.match(receipt.textContent!, /Garantía: 90 días/);
    assert.doesNotMatch(receipt.textContent!, /PENDIENTE DE SINCRONIZAR/);
    await flush(() => actionButton(ui.host, 'Cerrar comprobante').click());
    await flush(() => ui.host.querySelector<HTMLButtonElement>('#sidebar-tab-caja')!.click(), 80);
    const cash = await original('resumen_caja', { p_fecha: workshopDate() });
    assert.equal(cash.data.total_tarjeta, Number(baseline.data.total_tarjeta ?? 0) + 425.5);
    assert.match(ui.host.querySelector('#cash-ticket')!.textContent!, /Tarjeta: \$425\.50/);
  } finally {
    await ui.close();
  }
});

test('real App keeps the financial confirmation and durable operation when the server rejects delivery', async (t) => {
  await reset();
  const id = 'OS-94102';
  await seedReadyOrder(id);
  let prints = 0;
  t.mock.method(dom.window, 'print', () => { prints++; });
  const ui = await mount();
  try {
    await login(ui.host);
    const dialog = await requestTableDelivery(ui.host, id);
    const original = supabase.rpc.bind(supabase);
    let requests = 0;
    t.mock.method(supabase, 'rpc', (...args: Parameters<typeof supabase.rpc>) => {
      if (isDeliveryRpc(args)) {
        requests++;
        return Promise.resolve({ data: null, error: { message: 'La caja de hoy ya está cerrada.' } });
      }
      return original(...args);
    });
    await flush(() => dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })), 90);
    const stillOpen = ui.host.querySelector('[aria-labelledby="delivery-title"]');
    assert.ok(stillOpen);
    assert.match(stillOpen.querySelector('[role="alert"]')!.textContent!, /caja de hoy ya está cerrada/);
    assert.equal(ui.host.querySelector('#thermal-receipt-printable'), null);
    assert.equal(prints, 0);
    assert.equal(requests, 1);
    const remote = (await supabase.from('ordenes').select('*').eq('id', id).single()).data;
    assert.equal(remote.estado, 'Listo');
    assert.equal(remote.metodo_pago, null);
    const durable = JSON.parse(localStorage.getItem('celmart_sync_queue')!);
    assert.equal(durable.queue.length, 1);
    assert.equal(durable.queue[0].command.kind, 'delivery');
    assert.equal(durable.queue[0].command.orderId, id);
    assert.match(durable.queue[0].error, /caja de hoy ya está cerrada/);
    assert.equal(offlineStore.getSnapshot().pending, 1);
  } finally {
    await ui.close();
  }
});

test('an open offline delivery receipt adopts the authoritative server date after FIFO sync without printing twice', async (t) => {
  await reset();
  const id = 'OS-94103';
  await seedReadyOrder(id);
  let prints = 0;
  let deliveries = 0;
  t.mock.method(dom.window, 'print', () => { prints++; });
  const original = supabase.rpc.bind(supabase);
  t.mock.method(supabase, 'rpc', (...args: Parameters<typeof supabase.rpc>) => {
    if (isDeliveryRpc(args)) deliveries++;
    return original(...args);
  });
  const ui = await mount();
  try {
    await login(ui.host);
    const dialog = await requestTableDelivery(ui.host, id);
    await flush(() => {
      Object.defineProperty(dom.window.navigator, 'onLine', { configurable: true, value: false });
      dom.window.dispatchEvent(new Event('offline'));
    });
    await flush(() => dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })), 90);
    await flush(undefined, 40);
    assert.equal(deliveries, 0);
    assert.equal(offlineStore.getSnapshot().pending, 1);
    assert.equal(prints, 1);
    const receipt = ui.host.querySelector('#thermal-receipt-printable');
    assert.ok(receipt);
    assert.match(receipt.textContent!, /COPIA LOCAL · PENDIENTE DE SINCRONIZAR/);
    assert.equal((await supabase.from('ordenes').select('*').eq('id', id).single()).data.estado, 'Listo');
    const localOrder = offlineStore.getSnapshot().data.orders.find((order) => order.id === id)!;
    assert.ok(localOrder.fechaEntrega);
    // A distinct server day makes stale receipt snapshots observable. Fake only
    // Date; real timers keep React effects and requestAnimationFrame running.
    const serverAt = new Date(Date.parse(localOrder.fechaEntrega) + 86400000).toISOString();
    t.mock.timers.enable({ apis: ['Date'], now: Date.parse(serverAt) });
    await flush(() => {
      Object.defineProperty(dom.window.navigator, 'onLine', { configurable: true, value: true });
      dom.window.dispatchEvent(new Event('online'));
    }, 130);
    await flush(undefined, 50);
    assert.equal(deliveries, 1);
    assert.equal(offlineStore.getSnapshot().pending, 0);
    const confirmed = (await supabase.from('ordenes').select('*').eq('id', id).single()).data;
    assert.equal(confirmed.estado, 'Entregado');
    assert.equal(confirmed.entregado_at, serverAt);
    assert.equal(offlineStore.getSnapshot().data.orders.find((order) => order.id === id)!.fechaEntrega, serverAt);
    assert.equal(ui.host.querySelector('#thermal-receipt-printable'), receipt);
    assert.doesNotMatch(receipt.textContent!, /COPIA LOCAL|PENDIENTE DE SINCRONIZAR/);
    const serverDate = new Date(serverAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
    assert.ok(receipt.textContent!.includes(`Entrega: ${serverDate}`));
    assert.equal(prints, 1);
  } finally {
    t.mock.timers.reset();
    await ui.close();
  }
});

async function seedInventoryItem(id: string, sku: string) {
  const item = { id, sku, nombre: `Producto QA ${sku}`, categoria: 'Accesorios', stock_actual: 5, stock_minimo: 1, costo_compra: 20, precio_venta: 75, compatibilidad: 'Universal', ubicacion: 'Gaveta QA' };
  const result = await supabase.from('inventario').insert(item);
  assert.equal(result.error, null);
  return item;
}
async function globalEnter(host: HTMLElement, value?: string) {
  if (value !== undefined) await type(host, '#global-search-input', value);
  await flush(() => host.querySelector('#global-search-input')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })), 70);
}

test('global Ctrl+K and exact Enter open a folio from any view and repeat the same SKU scan after local filter changes', async () => {
  await reset();
  const id = 'OS-94104';
  const item = await seedInventoryItem('scanner-integration', 'QA-SCAN-USB');
  await seedReadyOrder(id);
  const ui = await mount();
  try {
    await login(ui.host);
    await flush(() => ui.host.querySelector<HTMLButtonElement>('#sidebar-tab-clientes')!.click());
    await flush(() => dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })));
    assert.equal(document.activeElement?.id, 'global-search-input');
    await globalEnter(ui.host, id.toLowerCase());
    assert.ok(ui.host.querySelector('[aria-label="Cerrar expediente"]'));
    assert.match(ui.host.querySelector('[aria-label="Estado de la orden"]')!.closest('.fixed')!.textContent!, /OS-94104/);
    await flush(() => actionButton(ui.host, 'Cerrar expediente').click());
    await globalEnter(ui.host, item.sku.toLowerCase());
    const localSelector = '[placeholder="Buscar SKU, código de barras o escanear..."]';
    assert.equal(ui.host.querySelector<HTMLInputElement>(localSelector)!.value, item.sku);
    assert.equal(ui.host.querySelectorAll('tbody tr').length, 1);
    assert.match(ui.host.querySelector('tbody')!.textContent!, /QA-SCAN-USB/);
    await type(ui.host, localSelector, 'SIN-COINCIDENCIAS');
    await flush(() => actionButton(ui.host, 'Baterías').click());
    assert.doesNotMatch(ui.host.querySelector('tbody')!.textContent!, /QA-SCAN-USB/);
    // The global value is unchanged: every Enter must still reset the local
    // category and term, without remounting the inventory or losing its forms.
    await globalEnter(ui.host);
    assert.equal(ui.host.querySelector<HTMLInputElement>(localSelector)!.value, item.sku);
    assert.match(ui.host.querySelector('tbody')!.textContent!, /QA-SCAN-USB/);
    assert.equal(ui.host.querySelectorAll('thead th').length, 7);
  } finally { await ui.close(); }
});

test('real App counter sale charges once, writes its Kardex without a repair order, updates cash and optionally prints 58/80mm', async (t) => {
  await reset();
  const item = await seedInventoryItem('counter-integration', 'QA-POS-USB');
  const baseline = await supabase.rpc('resumen_caja', { p_fecha: workshopDate() });
  const beforeOrders = (await supabase.from('ordenes').select('*')).data.length;
  let prints = 0, requests = 0;
  t.mock.method(dom.window, 'print', () => { prints++; });
  const original = supabase.rpc.bind(supabase);
  t.mock.method(supabase, 'rpc', (...args: Parameters<typeof supabase.rpc>) => {
    if (args[0] === 'apply_offline_operation' && (args[1] as { p_command?: { kind?: string } })?.p_command?.kind === 'sale') requests++;
    return original(...args);
  });
  const ui = await mount();
  try {
    await login(ui.host);
    await flush(() => ui.host.querySelector<HTMLButtonElement>('#sidebar-tab-inventario')!.click());
    await flush(() => actionButton(ui.host, '⚡ Venta Rápida Mostrador').click());
    const dialog = ui.host.querySelector<HTMLDivElement>('[aria-labelledby="quick-sale-title"]');
    assert.ok(dialog);
    await type(dialog, '[aria-label="Buscar producto por nombre o SKU"]', item.sku);
    await flush(() => actionButton(dialog, `Seleccionar ${item.sku} ${item.nombre}`).click());
    await type(dialog, '[aria-label="Cantidad de venta"]', '2');
    await flush(() => actionButton(dialog, '🏦 Transferencia').click());
    await flush(() => {
      const form = dialog.querySelector('form')!;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }, 130);
    assert.equal(requests, 1);
    assert.equal(prints, 0);
    assert.equal(offlineStore.getSnapshot().pending, 0);
    const sold = (await supabase.from('ventas_mostrador').select('*').eq('item_id', item.id)).data;
    assert.equal(sold.length, 1);
    assert.equal(sold[0].cantidad, 2);
    assert.equal(sold[0].total, 150);
    assert.equal(sold[0].metodo_pago, 'Transferencia');
    assert.equal((await supabase.from('inventario').select('*').eq('id', item.id).single()).data.stock_actual, 3);
    const movements = (await supabase.from('movimientos_inventario').select('*').eq('repuesto_id', item.id)).data;
    assert.equal(movements.length, 1);
    assert.equal(movements[0].tipo, 'salida');
    assert.equal(movements[0].cantidad, -2);
    assert.equal(movements[0].motivo, 'Venta de mostrador');
    assert.ok(!movements[0].codigo_orden);
    assert.equal((await supabase.from('ordenes').select('*')).data.length, beforeOrders);
    const ticket = ui.host.querySelector('#counter-sale-ticket');
    assert.ok(ticket);
    assert.equal(ticket.getAttribute('data-paper-width'), '80mm');
    assert.match(ticket.textContent!, /VENTA DE MOSTRADOR/);
    assert.match(ticket.textContent!, /TOTAL:\$150\.00 MXN/);
    assert.doesNotMatch(ticket.textContent!, /PENDIENTE DE SINCRONIZAR/);
    await flush(() => {
      const paper = dialog.querySelector<HTMLSelectElement>('[aria-label="Ancho del ticket de venta"]')!;
      paper.value = '58mm'; paper.dispatchEvent(new Event('change', { bubbles: true }));
    });
    assert.equal(ticket.getAttribute('data-paper-width'), '58mm');
    await flush(() => actionButton(dialog, 'Imprimir ticket · 58mm').click());
    assert.equal(prints, 1);
    await flush(() => actionButton(dialog, 'Cerrar venta rápida').click());
    await flush(() => ui.host.querySelector<HTMLButtonElement>('#sidebar-tab-caja')!.click(), 80);
    const cash = await original('resumen_caja', { p_fecha: workshopDate() });
    assert.equal(cash.data.total_transferencia, Number(baseline.data.total_transferencia) + 150);
    assert.equal(cash.data.gastos_repuestos, Number(baseline.data.gastos_repuestos) + 40);
    assert.ok(ui.host.querySelector('#cash-ticket')!.textContent!.includes(`Transferencias: $${cash.data.total_transferencia.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`));
  } finally { await ui.close(); }
});

test('real App assigns and removes a physical part with matching stock, budget and Kardex entries', async (t) => {
  await reset();
  const id = 'OS-94105';
  const item = await seedInventoryItem('parts-integration', 'QA-PARTS-USB');
  await seedReadyOrder(id);
  let removals = 0;
  const original = supabase.rpc.bind(supabase);
  t.mock.method(supabase, 'rpc', (...args: Parameters<typeof supabase.rpc>) => {
    if (args[0] === 'apply_offline_operation' && (args[1] as { p_command?: { kind?: string } })?.p_command?.kind === 'removePart') removals++;
    return original(...args);
  });
  const ui = await mount();
  try {
    await login(ui.host);
    await globalEnter(ui.host, id);
    await flush(() => actionButton(ui.host, 'Costos & Repuestos (0)').click());
    await flush(() => {
      const select = ui.host.querySelector<HTMLSelectElement>('[aria-label="Repuesto del inventario"]')!;
      select.value = item.id; select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await type(ui.host, '[aria-label="Cantidad de refacciones"]', '2');
    await flush(() => actionButton(ui.host, '+ Asignar').click(), 110);
    const assigned = (await supabase.from('ordenes').select('*').eq('id', id).single()).data;
    assert.equal(assigned.repuestos_asignados.length, 1);
    assert.equal(assigned.repuestos_asignados[0].cantidad, 2);
    assert.equal(assigned.total_estimado, 650);
    assert.equal((await supabase.from('inventario').select('*').eq('id', item.id).single()).data.stock_actual, 3);
    await flush(() => {
      const remove = actionButton(ui.host, `Quitar refacción ${item.nombre} de ${id}`);
      remove.click(); remove.click();
    }, 110);
    assert.equal(removals, 1);
    const removed = (await supabase.from('ordenes').select('*').eq('id', id).single()).data;
    assert.deepEqual(removed.repuestos_asignados, []);
    assert.equal(removed.total_estimado, 500);
    assert.equal((await supabase.from('inventario').select('*').eq('id', item.id).single()).data.stock_actual, 5);
    const movements = (await supabase.from('movimientos_inventario').select('*').eq('codigo_orden', id)).data;
    assert.equal(movements.length, 2);
    const output = movements.find((movement: { tipo: string }) => movement.tipo === 'salida');
    const input = movements.find((movement: { tipo: string }) => movement.tipo === 'entrada');
    assert.equal(output.cantidad, -2);
    assert.equal(input.cantidad, 2);
    assert.match(output.motivo, new RegExp(`Asignado a orden ${id}`));
    assert.match(input.motivo, new RegExp(`Retirado de orden ${id}`));
    assert.equal(offlineStore.getSnapshot().pending, 0);
    assert.ok(ui.host.textContent!.includes('Costos & Repuestos (0)'));
  } finally { await ui.close(); }
});
