import assert from 'node:assert/strict';
import test from 'node:test';
import { initialOrders } from '../src/data/initialData';
import type { Order, WorkshopConfig } from '../src/types';
import {
  buildWhatsAppLink,
  defaultWhatsAppTemplates,
  formatWhatsAppPhone,
  sendAutomatedWhatsApp,
  testWhatsAppConnection,
} from '../src/lib/whatsapp';

const order: Order = {
  ...initialOrders[0],
  id: 'TEST-001',
  cliente: { nombre: 'Cliente de prueba', telefono: '+52 55 5000 1234' },
  fotosEvidencia: ['https://example.invalid/ordenes/photo.webp'],
};
const config: WorkshopConfig = {
  nombreTaller: 'CelMart', direccion: '', telefono: '', email: '', rfc: '',
  impresoraDefecto: 'USB - Impresora Térmica 80mm', anchoTicket: '80mm',
  diasGarantiaPantalla: 30, diasGarantiaBateria: 30, diasGarantiaPlaca: 30,
  politicaGarantiaTexto: '', plantillasWhatsApp: defaultWhatsAppTemplates,
  simboloMoneda: '$', tasaIva: 16,
  whatsappApiUrl: 'https://example.invalid/whatsapp/send', whatsappApiKey: 'limited-test-key',
  whatsappInstancia: 'celmart-test', whatsappAutoSend: true,
};

test('automation POST sends the agreed webhook contract and configured authentication', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (_url: string, _init: RequestInit) => new Response(null, { status: 202 }));
  const message = 'Diagnóstico listo 📱';
  assert.deepEqual(await sendAutomatedWhatsApp(order, message, config), { sentViaApi: true });
  assert.equal(fetchMock.mock.callCount(), 1);
  const [url, init] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, config.whatsappApiUrl);
  assert.equal(init.method, 'POST');
  assert.equal(init.credentials, 'omit');
  assert.ok(init.signal instanceof AbortSignal);
  assert.deepEqual(init.headers, {
    Accept: 'application/json', apikey: 'limited-test-key',
    Authorization: 'Bearer limited-test-key', 'Content-Type': 'application/json',
  });
  assert.deepEqual(JSON.parse(init.body as string), {
    phone: formatWhatsAppPhone(order.cliente.telefono), message,
    orderId: order.id, instance: 'celmart-test', mediaUrls: order.fotosEvidencia,
  });
});

test('disabled or unconfigured automation does not contact any endpoint', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected request'); });
  assert.deepEqual(await sendAutomatedWhatsApp(order, 'Mensaje', { ...config, whatsappAutoSend: false }), { sentViaApi: false });
  assert.deepEqual(await sendAutomatedWhatsApp(order, 'Mensaje', { ...config, whatsappApiUrl: '  ' }), { sentViaApi: false });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('invalid endpoint schemes, embedded credentials, phones and empty messages are rejected before fetch', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected request'); });
  for (const url of ['javascript:alert(1)', 'file:///private', 'not-a-url', 'https://user:secret@example.invalid/send']) {
    const result = await sendAutomatedWhatsApp(order, 'Mensaje', { ...config, whatsappApiUrl: url });
    assert.equal(result.sentViaApi, false);
    assert.ok(result.error);
    assert.ok(!result.error.includes('secret'));
  }
  assert.equal((await sendAutomatedWhatsApp({ ...order, cliente: { ...order.cliente, telefono: '123' } }, 'Mensaje', config)).sentViaApi, false);
  assert.equal((await sendAutomatedWhatsApp(order, '   ', config)).sentViaApi, false);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('non-success API responses fall back without retrying or disclosing response contents', async (t) => {
  let status = 401;
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('sensitive server body', { status }));
  for (const httpStatus of [401, 429, 500]) {
    status = httpStatus;
    const result = await sendAutomatedWhatsApp(order, 'Mensaje', config);
    assert.equal(result.sentViaApi, false);
    assert.match(result.error!, new RegExp(`HTTP ${status}`));
    assert.ok(!result.error!.includes('sensitive'));
  }
  assert.equal(fetchMock.mock.callCount(), 3);
});

test('network and CORS failures return an honest unconfirmed-send result', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  const result = await sendAutomatedWhatsApp(order, 'Mensaje', config);
  assert.equal(result.sentViaApi, false);
  assert.match(result.error!, /No se confirmó/);
  assert.match(result.error!, /CORS/);
});

test('API timeout aborts the request and warns that delivery is unconfirmed', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | undefined;
  t.mock.method(globalThis, 'fetch', (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    signal = init.signal!;
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  const resultPromise = sendAutomatedWhatsApp(order, 'Mensaje', config);
  t.mock.timers.tick(10_000);
  const result = await resultPromise;
  assert.equal(signal!.aborted, true);
  assert.equal(result.sentViaApi, false);
  assert.match(result.error!, /tiempo de espera/);
  assert.match(result.error!, /antes de reenviar/);
});

test('orders without evidence and key use an empty media list and no authorization headers', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (_url: string, _init: RequestInit) => new Response(null, { status: 204 }));
  await sendAutomatedWhatsApp({ ...order, fotosEvidencia: undefined }, 'Mensaje', { ...config, whatsappApiKey: '', whatsappInstancia: undefined });
  const init = fetchMock.mock.calls[0].arguments[1];
  assert.deepEqual(init.headers, { Accept: 'application/json', 'Content-Type': 'application/json' });
  assert.deepEqual(JSON.parse(init.body as string).mediaUrls, []);
});

test('connection check uses HEAD and never submits a message body or a phone', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (_url: string, _init: RequestInit) => new Response(null, { status: 204 }));
  assert.deepEqual(await testWhatsAppConnection(config), { reachable: true, status: 204 });
  const init = fetchMock.mock.calls[0].arguments[1];
  assert.equal(init.method, 'HEAD');
  assert.equal(init.body, undefined);
  assert.equal(init.cache, 'no-store');
});

test('connection check reports unsupported HEAD and browser network failures explicitly', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 405 }));
  const unsupported = await testWhatsAppConnection(config);
  assert.equal(unsupported.reachable, false);
  assert.equal(unsupported.status, 405);
  assert.match(unsupported.error!, /no admite HEAD/);
  fetchMock.mock.mockImplementation(async () => { throw new TypeError('CORS blocked'); });
  const blocked = await testWhatsAppConnection(config);
  assert.equal(blocked.reachable, false);
  assert.match(blocked.error!, /CORS/);
});

test('manual fallback link preserves message characters and stays on wa.me', () => {
  const message = 'Presupuesto $500 & diagnóstico 📱\n¿Autoriza?';
  const url = new URL(buildWhatsAppLink(order.cliente.telefono, message));
  assert.equal(url.origin, 'https://wa.me');
  assert.equal(url.searchParams.get('text'), message);
  assert.equal(url.pathname, `/${formatWhatsAppPhone(order.cliente.telefono)}`);
});
