import assert from 'node:assert/strict';
import test from 'node:test';
import { initialWorkshopConfig } from '../src/data/initialData';
import { loadSharedWorkshopConfig, normalizeWorkshopConfig, saveSharedWorkshopConfig } from '../src/lib/configRepository';
import { createMockSupabaseClient } from '../src/lib/supabase';

test('shared config normalizes missing templates and rejects malformed field types', () => {
  const config = normalizeWorkshopConfig({
    nombreTaller: null, telefono: 42, tasaIva: -1, anchoTicket: 'bogus',
    plantillasWhatsApp: { ingreso: 'Seguimiento: {{link_seguimiento}}', cambioEstatus: null },
    whatsappApiKey: 'client-webhook-key', whatsappAutoSend: true, unknownField: 'discard',
  });
  assert.equal(config.nombreTaller, initialWorkshopConfig.nombreTaller);
  assert.equal(config.telefono, initialWorkshopConfig.telefono);
  assert.equal(config.tasaIva, initialWorkshopConfig.tasaIva);
  assert.equal(config.anchoTicket, initialWorkshopConfig.anchoTicket);
  assert.equal(config.plantillasWhatsApp.ingreso, 'Seguimiento: {{link_seguimiento}}');
  assert.equal(config.plantillasWhatsApp.cambioEstatus, initialWorkshopConfig.plantillasWhatsApp.cambioEstatus);
  assert.equal(config.whatsappApiKey, 'client-webhook-key');
  assert.equal(config.whatsappAutoSend, true);
  assert.equal(Object.hasOwn(config, 'unknownField'), false);
});

test('first device seeds cache once; another device loads shared values without overwriting', async () => {
  const database = createMockSupabaseClient();
  const first = await loadSharedWorkshopConfig({ ...initialWorkshopConfig, nombreTaller: 'Compartido', whatsappApiKey: 'shared-key' }, database);
  const second = await loadSharedWorkshopConfig({ ...initialWorkshopConfig, nombreTaller: 'Caché desactualizada' }, database);
  assert.equal(first.nombreTaller, 'Compartido');
  assert.deepEqual(second, first);
});

test('concurrent first loads preserve the first shared configuration', async () => {
  const database = createMockSupabaseClient();
  const [first, second] = await Promise.all([
    loadSharedWorkshopConfig({ ...initialWorkshopConfig, nombreTaller: 'PC' }, database),
    loadSharedWorkshopConfig({ ...initialWorkshopConfig, nombreTaller: 'Móvil' }, database),
  ]);
  assert.deepEqual(first, second);
  assert.equal(first.nombreTaller, 'PC');
});

test('upsert updates the singleton and emits config Realtime for other sessions', async () => {
  const database = createMockSupabaseClient();
  const events: unknown[] = [];
  const channel = database.channel('config-test').on('postgres_changes', {
    event: '*', schema: 'public', table: 'configuracion_taller', filter: 'id=eq.default',
  }, (event) => events.push(event)).subscribe();
  await loadSharedWorkshopConfig(initialWorkshopConfig, database);
  const saved = await saveSharedWorkshopConfig({
    ...initialWorkshopConfig, telefono: '+52 55 1234 5678', diasGarantiaPlaca: 180,
    whatsappApiUrl: 'https://webhook.example.test/send', whatsappApiKey: 'limited-key', whatsappAutoSend: true,
  }, database);
  const otherDevice = await loadSharedWorkshopConfig(initialWorkshopConfig, database);
  assert.deepEqual(otherDevice, saved);
  assert.equal(otherDevice.diasGarantiaPlaca, 180);
  assert.equal(otherDevice.whatsappApiKey, 'limited-key');
  assert.ok(events.length >= 2);
  const rows = await database.from('configuracion_taller').select('*');
  assert.equal(rows.data.length, 1);
  await database.removeChannel(channel);
});

test('shared read and save errors are propagated so the UI cannot claim success', async () => {
  const readFailure = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'offline' } }) }) }) }) };
  await assert.rejects(loadSharedWorkshopConfig(initialWorkshopConfig, readFailure as any), /offline/);
  const writeFailure = { from: () => ({ upsert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'permission denied' } }) }) }) }) };
  await assert.rejects(saveSharedWorkshopConfig(initialWorkshopConfig, writeFailure as any), /permission denied/);
});
