import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { assignedTo, orderTiming } from '../src/lib/workbench';
import { initialOrders, initialWorkshopConfig } from '../src/data/initialData';
import { EquipmentLabelModal } from '../src/components/EquipmentLabelModal';
import { createMockSupabaseClient } from '../src/lib/supabase';
import { mapOrderRow } from '../src/lib/orderRepository';
import {
  withWhatsAppDeadline,
  WHATSAPP_TIMEOUT_MS,
  sendAutomatedWhatsApp,
  testWhatsAppConnection,
} from '../src/lib/whatsapp';

test('assignment filter requires an explicitly selected technician and normalizes names', () => {
  const order = {
    ...initialOrders[0],
    tecnico: { nombre: '  José López ', iniciales: 'JL' },
  };
  assert.equal(assignedTo(order, ''), false);
  assert.equal(assignedTo(order, 'JOSÉ LÓPEZ'), true);
  assert.equal(assignedTo(order, 'Otro técnico'), false);
});
test('elapsed age and status alarms use independent verified timestamps with exact48h boundary', () => {
  const now = new Date('2026-10-31T12:00:00Z');
  const order = {
    ...initialOrders[0],
    estado: 'En Diagnóstico' as const,
    fechaIngreso: '2026-10-28T12:00:00Z',
    estadoActualizadoAt: '2026-10-29T12:00:00Z',
  };
  assert.match(orderTiming(order, now).label, /3 días/);
  assert.equal(orderTiming(order, now).stale, false);
  assert.equal(orderTiming(order, new Date(now.getTime() + 1)).stale, true);
  assert.equal(
    orderTiming({ ...order, estadoActualizadoAt: undefined }, now)
      .statusUnknown,
    true
  );
  assert.equal(
    orderTiming({ ...order, estadoActualizadoAt: undefined }, now).stale,
    false
  );
  assert.match(
    orderTiming({ ...order, fechaIngreso: 'malformed' }, now).label,
    /sin fecha/
  );
});
test('label contains the requested private physical identification and real SVG QR without finances', () => {
  const order = {
    ...initialOrders[0],
    id: 'OS-9000',
    ubicacionFisica: 'Gaveta B-04',
    dispositivo: { ...initialOrders[0].dispositivo, claveBloqueo: 'PIN-4321' },
    notasTecnicas: [
      { id: 'n', autor: 'Técnico', fecha: 'Hoy', contenido: 'SECRET-NOTE' },
    ],
  };
  const html = renderToStaticMarkup(
    React.createElement(EquipmentLabelModal, {
      order,
      config: initialWorkshopConfig,
      onClose: () => {},
    })
  );
  assert.match(html, /Gaveta B-04/);
  assert.match(html, /PIN-4321/);
  assert.match(html, /OS-9000/);
  assert.match(html, /Cliente:/);
  assert.match(html, /<svg/);
  assert.match(html, /<path/);
  assert.match(html, /50mm 30mm/);
  assert.doesNotMatch(html, /SECRET-NOTE|TOTAL ESTIMADO|Mano de obra/);
});
test('mock persists location across reads and only a real state transition updates status time', async () => {
  const d = createMockSupabaseClient();
  await d
    .from('ordenes')
    .insert({
      id: 'OS-100099',
      estado: 'Recibido',
      created_at: '2026-01-01T00:00:00Z',
    });
  const first = await d
    .from('ordenes')
    .select('*')
    .eq('id', 'OS-100099')
    .single();
  await d
    .from('ordenes')
    .update({
      ubicacion_fisica: 'Gaveta A-2',
      estado_actualizado_at: '1900-01-01',
    })
    .eq('id', 'OS-100099');
  const saved = await d
    .from('ordenes')
    .select('*')
    .eq('id', 'OS-100099')
    .single();
  assert.equal(mapOrderRow(saved.data).ubicacionFisica, 'Gaveta A-2');
  assert.equal(
    saved.data.estado_actualizado_at,
    first.data.estado_actualizado_at
  );
  assert.equal(mapOrderRow(saved.data).fechaIngreso, '2026-01-01T00:00:00Z');
});
test('hard deadline settles at1500ms even when a transport ignores abort', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let aborted = false,
    settled = false;
  const promise = withWhatsAppDeadline((signal) => {
    signal.addEventListener('abort', () => (aborted = true));
    return new Promise(() => {});
  }).catch((e) => {
    settled = true;
    return e;
  });
  assert.equal(WHATSAPP_TIMEOUT_MS, 1500);
  t.mock.timers.tick(1499);
  await Promise.resolve();
  assert.equal(aborted, false);
  assert.equal(settled, false);
  t.mock.timers.tick(1);
  const error = await promise;
  assert.equal(aborted, true);
  assert.ok(error instanceof DOMException);
  assert.equal(error.name, 'TimeoutError');
});
test('Evolution sends the actual provider contract and verifies linked instance state', async (t) => {
  let state = 'open';
  const calls: { url: string; init?: RequestInit }[] = [];
  t.mock.method(
    globalThis,
    'fetch',
    async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return init?.method === 'GET'
        ? Response.json({ instance: { state } })
        : Response.json({ key: { id: 'accepted' } });
    }
  );
  const config = {
    ...initialWorkshopConfig,
    whatsappProvider: 'evolution' as const,
    whatsappAutoSend: true,
    whatsappApiUrl: 'https://server.example/base/',
    whatsappInstancia: 'celmart 1',
    whatsappApiKey: 'instance-key',
  };
  assert.equal((await testWhatsAppConnection(config)).reachable, true);
  state = 'close';
  assert.equal((await testWhatsAppConnection(config)).reachable, false);
  assert.equal(
    (await sendAutomatedWhatsApp(initialOrders[0], 'Prueba', config))
      .sentViaApi,
    true
  );
  assert.match(calls[0].url, /instance\/connectionState\/celmart%201$/);
  assert.match(calls[2].url, /message\/sendText\/celmart%201$/);
  const payload = JSON.parse(calls[2].init?.body as string);
  assert.equal(payload.text, 'Prueba');
  assert.equal(typeof payload.number, 'string');
  assert.equal(Object.hasOwn(payload, 'phone'), false);
});
