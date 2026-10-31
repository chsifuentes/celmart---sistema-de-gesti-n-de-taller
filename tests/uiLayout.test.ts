import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Header } from '../src/components/Header';
import { InventoryView } from '../src/components/InventoryView';
import { initialInventoryItems } from '../src/data/initialData';

test('the minimal sync pill appears only offline or with pending synchronization', () => {
  const props = {
    globalSearch: '',
    setGlobalSearch() {},
    onOpenNewOrder() {},
    urgentOrdersCount: 0,
    viewMode: 'recepcion' as const,
    onViewModeChange() {},
  };
  const clean = renderToStaticMarkup(
    createElement(Header, {
      ...props,
      syncState: { offline: false, pending: 0, syncing: false, error: null },
    })
  );
  assert.doesNotMatch(clean, /Estado de sincronización/);
  const offline = renderToStaticMarkup(
    createElement(Header, {
      ...props,
      syncState: { offline: true, pending: 2, syncing: false, error: null },
    })
  );
  assert.match(offline, /⚡ Offline/);
  assert.doesNotMatch(offline, /<select/);
  const syncing = renderToStaticMarkup(
    createElement(Header, {
      ...props,
      syncState: { offline: false, pending: 2, syncing: true, error: null },
    })
  );
  assert.match(syncing, /🔄 Sincronizando/);
});

test('both operation modes keep global search and compact actions without configuration selectors', () => {
  for (const viewMode of ['recepcion', 'taller'] as const) {
    const html = renderToStaticMarkup(
      createElement(Header, {
        globalSearch: '',
        setGlobalSearch() {},
        onOpenNewOrder() {},
        urgentOrdersCount: 0,
        viewMode,
        onViewModeChange() {},
      })
    );
    assert.match(html, /Buscar cliente por nombre o equipo por IMEI/);
    for (const label of [
      'Recepción',
      'Taller',
      'Notificaciones y alertas',
      'Nueva Orden de Servicio',
      'Cuenta del taller',
    ]) {
      assert.ok(html.includes(`aria-label="${label}"`), label);
    }
    assert.doesNotMatch(
      html,
      /<select|Modo de Envío|Modo Manual wa.me|Técnico del turno|Perfil del turno/
    );
  }
});

test('inventory always renders all seven columns, categories, costs, stock adjustments and editing actions', () => {
  const item = {
    ...initialInventoryItems[0],
    imagenUrl: 'https://images.example/part.webp',
  };
  const html = renderToStaticMarkup(
    createElement(InventoryView, {
      inventory: [item],
      onUpdateStock() {},
      onAddInventoryItem() {},
      onEditInventoryItem() {},
      onDeleteInventoryItem() {},
    })
  );
  assert.equal((html.match(/<th /g) || []).length, 7);
  for (const label of [
    'REPUESTO / SKU',
    'CATEGORÍA',
    'COMPATIBILIDAD / UBICACIÓN',
    'PRECIO (COSTO / VENTA)',
    'ESTADO STOCK',
    'AJUSTE RÁPIDO',
    'ACCIONES',
    'Todas',
    'Pantallas',
    'Baterías',
    'Flex y Puertos',
    'Microelectrónica/ICs',
    'Accesorios',
    'Editar repuesto',
    'Eliminar repuesto',
    'Restar 1 unidad',
    'Sumar 1 unidad',
  ]) {
    assert.ok(html.includes(label), label);
  }
  assert.match(html, /<table/);
  assert.match(html, /part.webp/);
  assert.ok(html.replace(/<!--.*?-->/g, '').includes(`$${item.costoCompra}`));
  assert.ok(html.includes(item.sku));
});
