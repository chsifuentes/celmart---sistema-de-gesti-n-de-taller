import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicOrderTracker, PublicTrackingRecord } from '../src/components/PublicOrderTracker';
import { fetchPublicOrderTracking, getTrackingProgress, isValidTrackingOrderId, parsePublicOrderTracking } from '../src/lib/publicTracking';
import type { OrderStatus } from '../src/types';

function publicFixture() {
  return {
    id: 'OS-2418', estado: 'En Reparación',
    dispositivo: { marca: 'Sony', modelo: 'PS5', categoria: 'Consola' },
    fallaDeclarada: 'Sin imagen por HDMI', fotosEvidencia: ['https://example.test/taller-media/orden.webp'],
    costoManoObra: 350, totalEstimado: 500, garantiaDias: 90, fechaEntrega: null,
    clienteTelefonoMascara: '***-***-5678',
    repuestos: [{ nombre: 'HDMI', cantidad: 2, precioUnitario: 75 }],
    taller: { nombre: 'CelMart', telefono: '5587654321', politicaGarantiaTexto: 'Garantía sobre la reparación realizada.', simboloMoneda: '$' },
  };
}

test('public tracking selects an explicit allowlist at every nested level', () => {
  const input = publicFixture();
  const malicious = {
    ...input,
    cliente: { nombre: 'PRIVATE_NAME', email: 'PRIVATE_EMAIL', telefono: '5551112222' },
    notasTecnicas: [{ contenido: 'PRIVATE_NOTE' }],
    notas_tecnicas: [{ contenido: 'PRIVATE_NOTE_DB' }],
    whatsappApiKey: 'PRIVATE_API_KEY',
    dispositivo: { ...input.dispositivo, imei: 'PRIVATE_IMEI', claveBloqueo: 'PRIVATE_PIN', patronPuntos: [1, 5, 9] },
    repuestos: [{ ...input.repuestos[0], sku: 'PRIVATE_SKU', costoCompra: 30 }],
    taller: { ...input.taller, whatsappApiKey: 'PRIVATE_WORKSHOP_KEY', email: 'PRIVATE_WORKSHOP_EMAIL' },
  };
  const result = parsePublicOrderTracking(malicious)!;
  assert.deepEqual(Object.keys(result).sort(), ['id', 'estado', 'dispositivo', 'fallaDeclarada', 'fotosEvidencia', 'costoManoObra', 'totalEstimado', 'garantiaDias', 'fechaEntrega', 'clienteTelefonoMascara', 'repuestos', 'taller'].sort());
  assert.deepEqual(result.dispositivo, input.dispositivo);
  assert.deepEqual(result.repuestos, input.repuestos);
  assert.deepEqual(result.taller, input.taller);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|5551112222|patronPuntos|claveBloqueo|whatsappApiKey|costoCompra/);
});

test('even an unmasked mock phone is reduced to its last four digits', () => {
  assert.equal(parsePublicOrderTracking({ ...publicFixture(), clienteTelefonoMascara: '+52 (55) 1234-5678' })?.clienteTelefonoMascara, '***-***-5678');
  assert.equal(parsePublicOrderTracking({ ...publicFixture(), clienteTelefonoMascara: '123' })?.clienteTelefonoMascara, 'Sin teléfono');
  assert.equal(parsePublicOrderTracking({ ...publicFixture(), clienteTelefonoMascara: null })?.clienteTelefonoMascara, 'Sin teléfono');
});

test('public photos allow web images and compressed WebP but reject executable or credential URLs', () => {
  const result = parsePublicOrderTracking({ ...publicFixture(), fotosEvidencia: [
    'https://example.test/photo.webp?x=1&y=2', 'http://example.test/photo.webp', 'data:image/webp;base64,UklGRg==',
    'javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'data:image/svg+xml,<svg onload=alert(1)>',
    'https://user:password@example.test/photo.webp', 'file:///private.jpg', null, 42,
  ] })!;
  assert.deepEqual(result.fotosEvidencia, ['https://example.test/photo.webp?x=1&y=2', 'http://example.test/photo.webp', 'data:image/webp;base64,UklGRg==']);
});

test('legacy numeric/null values remain readable and malformed amounts never become NaN', () => {
  const result = parsePublicOrderTracking({ ...publicFixture(), costoManoObra: '350.50', totalEstimado: Infinity,
    garantiaDias: -1, fechaEntrega: 'not-a-date', dispositivo: { categoria: 'unknown' },
    repuestos: [{ nombre: 'HDMI', cantidad: '2', precioUnitario: '75' }], taller: null,
  })!;
  assert.equal(result.costoManoObra, 350.5);
  assert.equal(result.totalEstimado, 0);
  assert.equal(result.garantiaDias, 0);
  assert.equal(result.fechaEntrega, null);
  assert.equal(result.dispositivo.categoria, 'Smartphone');
  assert.equal(result.taller.nombre, 'CelMart');
  assert.deepEqual(result.repuestos, [{ nombre: 'HDMI', cantidad: 2, precioUnitario: 75 }]);
});

test('missing orders are distinct from malformed backend responses', () => {
  assert.equal(parsePublicOrderTracking(null), null);
  for (const value of [{}, [], { ...publicFixture(), estado: 'unknown' }, { ...publicFixture(), id: 'not-an-order' }]) {
    assert.throws(() => parsePublicOrderTracking(value), /seguimiento no está disponible/);
  }
});

test('public reads call only the sanitized RPC with the requested id', async () => {
  const calls: unknown[] = [];
  const database = { rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    return { data: { ...publicFixture(), cliente_nombre: 'PRIVATE_NAME' }, error: null };
  } };
  const result = await fetchPublicOrderTracking('OS-2418', database);
  assert.deepEqual(calls, [{ name: 'get_order_tracking', args: { p_order_id: 'OS-2418' } }]);
  assert.equal(result?.id, 'OS-2418');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_NAME|cliente_nombre/);
});

test('invalid tracking ids never reach the database', async () => {
  let calls = 0;
  const database = { rpc: async () => { calls++; return { data: null, error: null }; } };
  for (const value of ['', 'os-2418', 'OS-2418?x=1', 'OS-1/../../', 'OS-' + '1'.repeat(62), 'OS-1\n']) {
    assert.equal(isValidTrackingOrderId(value), false);
    assert.equal(await fetchPublicOrderTracking(value, database), null);
  }
  assert.equal(calls, 0);
});

test('RPC errors and mismatched ids never become a successful public order', async () => {
  await assert.rejects(fetchPublicOrderTracking('OS-2418', { rpc: async () => ({ data: null, error: { message: 'PRIVATE_DATABASE_DETAIL' } }) }), (error: Error) => {
    assert.doesNotMatch(error.message, /PRIVATE_DATABASE_DETAIL/);
    return /No pudimos consultar/.test(error.message);
  });
  await assert.rejects(fetchPublicOrderTracking('OS-2418', { rpc: async () => ({ data: { ...publicFixture(), id: 'OS-999' }, error: null }) }), /seguimiento no está disponible/);
  assert.equal(await fetchPublicOrderTracking('OS-2418', { rpc: async () => ({ data: null, error: null }) }), null);
});

test('public reads abort promptly even when a mock transport never settles', async () => {
  const controller = new AbortController();
  const request = fetchPublicOrderTracking('OS-2418', { rpc: () => new Promise(() => {}) }, controller.signal);
  controller.abort();
  await assert.rejects(request, (error: Error) => error.name === 'AbortError');
});

test('an already canceled read does not call the RPC', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(fetchPublicOrderTracking('OS-2418', { rpc: async () => { calls++; return { data: null, error: null }; } }, controller.signal), (error: Error) => error.name === 'AbortError');
  assert.equal(calls, 0);
});

test('aborting during RPC construction cannot leave a loading request stuck', async () => {
  const controller = new AbortController();
  await assert.rejects(fetchPublicOrderTracking('OS-2418', { rpc: () => { controller.abort(); return new Promise(() => {}); } }, controller.signal), (error: Error) => error.name === 'AbortError');
});

test('holds and warranty review never imply a completed repair or delivery', () => {
  const statuses: OrderStatus[] = ['Recibido', 'En Diagnóstico', 'Esperando Presupuesto', 'Esperando Repuesto', 'En Reparación', 'Listo', 'Entregado', 'Garantía'];
  for (const status of statuses) {
    const progress = getTrackingProgress(status);
    assert.ok(progress.step >= 0 && progress.step <= 4);
    assert.equal(progress.step === 4, status === 'Entregado');
    assert.equal(progress.step === 3, status === 'Listo');
  }
  assert.deepEqual(['Esperando Presupuesto', 'Esperando Repuesto', 'Garantía'].map((status) => getTrackingProgress(status as OrderStatus).hold), [true, true, true]);
  assert.equal(getTrackingProgress('Garantía').step, 1);
});

test('rendered public details contain the budget and photos without private order/config fields', () => {
  const input = publicFixture();
  const safe = parsePublicOrderTracking({ ...input,
    cliente: { nombre: 'PRIVATE_CUSTOMER_NAME', email: 'PRIVATE_EMAIL' },
    dispositivo: { ...input.dispositivo, imei: 'PRIVATE_IMEI', claveBloqueo: 'PRIVATE_PIN' },
    notasTecnicas: [{ contenido: 'PRIVATE_NOTE' }],
    taller: { ...input.taller, whatsappApiKey: 'PRIVATE_API_KEY', whatsappApiUrl: 'https://private-webhook.test' },
  })!;
  const markup = renderToStaticMarkup(createElement(PublicTrackingRecord, { order: safe }));
  assert.match(markup, /OS-2418/);
  assert.match(markup, /Sin imagen por HDMI/);
  assert.match(markup, /\$350\.00/);
  assert.match(markup, /\$150\.00/);
  assert.match(markup, /\$500\.00/);
  assert.match(markup, /\*\*\*-\*\*\*-5678/);
  assert.match(markup, /Ampliar foto 1 del equipo/);
  assert.match(markup, /wa\.me\/5215587654321/);
  assert.doesNotMatch(markup, /PRIVATE_|private-webhook|cliente_nombre|notas_tecnicas/);
  assert.doesNotMatch(markup, /<(?:input|textarea|select|form)\b|contenteditable/i);
});

test('rendered warranty review keeps diagnosis active and missing delivery dates explicit', () => {
  const safe = parsePublicOrderTracking({ ...publicFixture(), estado: 'Garantía' })!;
  const reviewMarkup = renderToStaticMarkup(createElement(PublicTrackingRecord, { order: safe }));
  assert.match(reviewMarkup, /Revisión en garantía/);
  assert.match(reviewMarkup, /aria-current="step"[^>]*>[\s\S]*?Diagnóstico/);
  const delivered = parsePublicOrderTracking({ ...publicFixture(), estado: 'Entregado', fechaEntrega: null })!;
  assert.match(renderToStaticMarkup(createElement(PublicTrackingRecord, { order: delivered })), /Fecha no registrada/);
});

test('public tracker renders without a login form or administrative navigation', () => {
  const markup = renderToStaticMarkup(createElement(PublicOrderTracker, { orderId: 'OS-2418' }));
  assert.match(markup, /Seguimiento de tu reparación/);
  assert.match(markup, /Buscando tu equipo/);
  assert.doesNotMatch(markup, /Iniciar [Ss]esión|Administración|Técnicos|<form|type="password"/);
});
