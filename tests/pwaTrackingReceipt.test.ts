import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { initialOrders, initialWorkshopConfig } from '../src/data/initialData';
import { ThermalReceiptModal } from '../src/components/ThermalReceiptModal';
import { getTrackingUrl } from '../src/lib/trackingUrl';
import { buildDeliveryWhatsAppMessage, defaultWhatsAppTemplates, replaceWhatsAppVariables } from '../src/lib/whatsapp';

test('tracking URLs encode the complete folio and use only a valid app origin', () => {
  const id = 'OS-123/A&B ñ';
  const url = getTrackingUrl(id, 'https://celmart.example/a-path?old=1#old');
  assert.equal(url, `https://celmart.example/?track=${encodeURIComponent(id)}`);
  assert.equal(new URL(url).searchParams.get('track'), id);
  for (const invalidOrigin of ['null', 'file:///local', 'javascript:alert(1)', 'https://user:secret@example.invalid']) {
    assert.equal(getTrackingUrl(id, invalidOrigin), `/?track=${encodeURIComponent(id)}`);
  }
});

test('WhatsApp tracking variables preserve literal customer text and final receipt excludes internal secrets', () => {
  const order = {
    ...initialOrders[0], id: 'OS-LOCAL', estado: 'Entregado' as const, fechaEntrega: '2026-10-29T18:00:00.000Z',
    cliente: { nombre: 'Ana $& García', telefono: '5550001234' },
    dispositivo: { ...initialOrders[0].dispositivo, claveBloqueo: 'PIN-SECRET-9274' },
    notasTecnicas: [{ id: 'private', autor: 'Taller', fecha: 'ahora', contenido: 'NOTA-INTERNA-SECRETA' }],
    costoManoObra: 500, garantiaDias: 90,
    repuestosAsignados: [{ id: 'part', nombre: 'Puerto USB-C', sku: 'USB', cantidad: 2, precioUnitario: 100 }],
  };
  const config = { ...initialWorkshopConfig, politicaGarantiaTexto: 'Condiciones de garantía de prueba.', whatsappApiKey: 'API-SECRET-123' };
  const replaced = replaceWhatsAppVariables('{{CLIENTE}} · {{link_seguimiento}}', order, config);
  assert.match(replaced, /^Ana \$& García · /);
  assert.match(replaced, /\?track=OS-LOCAL/);
  for (const template of Object.values(defaultWhatsAppTemplates)) assert.match(template, /\{\{link_seguimiento\}\}/);
  const receipt = buildDeliveryWhatsAppMessage(order, config);
  assert.match(receipt, /COMPROBANTE DE ENTREGA/);
  assert.match(receipt, /2 × Puerto USB-C/);
  assert.match(receipt, /700\.00/);
  assert.match(receipt, /90 días/);
  assert.match(receipt, /2026/);
  assert.match(receipt, /Condiciones de garantía de prueba/);
  assert.match(receipt, /\?track=OS-LOCAL/);
  for (const secret of ['PIN-SECRET-9274', 'NOTA-INTERNA-SECRETA', 'API-SECRET-123']) assert.ok(!receipt.includes(secret));
  assert.match(buildDeliveryWhatsAppMessage({ ...order, fechaEntrega: undefined }, config), /Fecha de entrega: No registrada/);
});

test('thermal receipt renders real QR paths with tracking fallback and honors both paper widths without PIN', () => {
  const order = { ...initialOrders[0], id: 'OS-QR-LOCAL', dispositivo: { ...initialOrders[0].dispositivo, claveBloqueo: 'PRIVATE-PIN-DO-NOT-PRINT' }, checklist: {} };
  for (const anchoTicket of ['58mm', '80mm'] as const) {
    const markup = renderToStaticMarkup(React.createElement(ThermalReceiptModal, { isOpen: true, order, onClose() {}, config: { ...initialWorkshopConfig, anchoTicket } }));
    assert.ok(markup.includes(`data-paper-width="${anchoTicket}"`));
    assert.ok(markup.includes(`width:${anchoTicket}`));
    const qr = [...markup.matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/g)].map((match) => match[0]).find((svg) => svg.includes('<title>Seguimiento de la orden'));
    assert.ok(qr);
    assert.match(qr, /viewBox="0 0 \d+ \d+"/);
    assert.match(qr, /fill="#000000" d="M[^"]{100,}"/);
    assert.match(qr, /width:32mm;height:32mm/);
    assert.ok(markup.includes('href="/?track=OS-QR-LOCAL"'));
    assert.match(markup, /Sin comprobar/);
    assert.ok(!markup.includes('PRIVATE-PIN-DO-NOT-PRINT'));
    assert.ok(!markup.includes('||| | ||||'));
  }
});

test('PWA metadata references valid install icons and standalone launch settings', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.prefer_related_applications, false);
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((item: { sizes: string; purpose: string }) => item.sizes === `${size}x${size}` && item.purpose === 'any');
    assert.ok(icon);
    const bytes = await readFile(new URL(`../public${icon.src}`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
  assert.ok(manifest.icons.some((item: { purpose: string }) => item.purpose === 'maskable'));
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /rel="manifest" href="\/manifest.json"/);
  assert.match(html, /rel="apple-touch-icon"/);
});

test('service worker caches only declared static assets and leaves API/media/POST requests untouched', async () => {
  const handlers: Record<string, (event: any) => void> = {};
  const cachedPaths: string[] = [];
  const deleted: string[] = [];
  const offline = new Response('Reconnect to CelMart', { headers: { 'Content-Type': 'text/html' } });
  const context = vm.createContext({
    self: { location: { origin: 'https://celmart.example' }, clients: { claim: async () => undefined }, addEventListener: (name: string, callback: (event: any) => void) => { handlers[name] = callback; } },
    caches: {
      open: async () => ({ addAll: async (paths: string[]) => { cachedPaths.push(...paths); }, match: async () => undefined }),
      match: async (path: string) => path === '/offline.html' ? offline : undefined,
      keys: async () => ['celmart-static-v0', 'celmart-static-v1', 'other-app-cache'],
      delete: async (key: string) => { deleted.push(key); return true; },
    },
    fetch: async () => { throw new Error('Offline fixture'); }, URL, Response,
  });
  vm.runInContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
  let work: Promise<unknown> | undefined;
  handlers.install({ waitUntil(promise: Promise<unknown>) { work = promise; } });
  await work;
  assert.ok(cachedPaths.includes('/offline.html'));
  assert.ok(cachedPaths.every((path) => path === '/manifest.json' || path === '/offline.html' || path.startsWith('/icons/')));
  handlers.activate({ waitUntil(promise: Promise<unknown>) { work = promise; } });
  await work;
  assert.deepEqual(deleted, ['celmart-static-v0']);

  for (const request of [
    { url: 'https://celmart.example/api/config', method: 'GET', mode: 'cors' },
    { url: 'https://project.supabase.co/rest/v1/ordenes', method: 'GET', mode: 'cors' },
    { url: 'https://project.supabase.co/storage/v1/object/public/taller-media/photo.webp', method: 'GET', mode: 'cors' },
    { url: 'https://celmart.example/api/whatsapp', method: 'POST', mode: 'cors' },
  ]) {
    let intercepted = false;
    handlers.fetch({ request, respondWith() { intercepted = true; } });
    assert.equal(intercepted, false, request.url);
  }
  let navigation: Promise<Response> | undefined;
  handlers.fetch({ request: { url: 'https://celmart.example/?track=OS-123', method: 'GET', mode: 'navigate' }, respondWith(response: Promise<Response>) { navigation = response; } });
  assert.ok(navigation);
  assert.equal(await (await navigation).text(), 'Reconnect to CelMart');
});
