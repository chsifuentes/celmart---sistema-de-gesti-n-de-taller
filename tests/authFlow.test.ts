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
