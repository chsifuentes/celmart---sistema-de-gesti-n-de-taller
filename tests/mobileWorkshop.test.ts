import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { initialOrders } from '../src/data/initialData';
import {
  MobileWorkshopView,
  filterWorkshopOrders,
  getOrderUnlock,
  getWorkshopActions,
  getWorkshopLane,
  getVisibleWorkshopOrders,
} from '../src/components/MobileWorkshopView';
import { DeviceDetailDrawer } from '../src/components/DeviceDetailDrawer';
import type { Order, OrderStatus } from '../src/types';

function fixture(id: string, status: OrderStatus, urgent = false): Order {
  return {
    ...initialOrders[0],
    id,
    estado: status,
    prioridadUrgente: urgent,
    cliente: { nombre: 'María López', telefono: '5589123456' },
    dispositivo: {
      marca: 'Sony',
      modelo: 'PlayStation 5',
      imei: 'SER-123',
      categoria: 'Consola',
    },
    fallaDeclarada: 'Sin imagen por HDMI',
    tecnico: { nombre: 'Andrés', iniciales: 'AN' },
  };
}

test('all active statuses have a workshop lane and delivered orders leave the board', () => {
  const expected: [OrderStatus, 'cola' | 'mesa' | 'listos' | null][] = [
    ['Recibido', 'cola'],
    ['En Diagnóstico', 'cola'],
    ['Esperando Presupuesto', 'mesa'],
    ['Garantía', 'cola'],
    ['En Reparación', 'mesa'],
    ['Esperando Repuesto', 'mesa'],
    ['Listo', 'listos'],
    ['Entregado', null],
  ];
  for (const [status, lane] of expected)
    assert.equal(getWorkshopLane(status), lane, status);
});

test('workshop search accepts accents and locates clients, phone, serial, faults and technicians', () => {
  const order = fixture('OS-MOVIL', 'En Diagnóstico');
  for (const term of [
    ' MARIA ',
    'lopez',
    '558912',
    'playstation',
    'ser-123',
    'consola',
    'hdmi',
    'andres',
    'diagnostico',
    'os-movil',
  ]) {
    assert.deepEqual(
      filterWorkshopOrders([order], 'cola', term).map((item) => item.id),
      ['OS-MOVIL'],
      term
    );
  }
  assert.deepEqual(filterWorkshopOrders([order], 'mesa', 'maria'), []);
  assert.deepEqual(filterWorkshopOrders([order], 'cola', 'bateria'), []);
});

test('urgent orders rise within their lane without mutating the source or leaking delivered orders', () => {
  const orders = [
    fixture('normal-1', 'Recibido'),
    fixture('urgent-1', 'Recibido', true),
    fixture('normal-2', 'Garantía'),
    fixture('urgent-2', 'En Diagnóstico', true),
    fixture('done', 'Entregado', true),
    fixture('ready', 'Listo'),
  ];
  const original = orders.map((order) => order.id);
  assert.deepEqual(
    filterWorkshopOrders(orders, 'cola', '').map((order) => order.id),
    ['urgent-1', 'urgent-2', 'normal-1', 'normal-2']
  );
  assert.deepEqual(
    orders.map((order) => order.id),
    original
  );
  assert.deepEqual(
    filterWorkshopOrders(orders, 'listos', '').map((order) => order.id),
    ['ready']
  );
});

test('every active order can advance and ready orders advance explicitly to delivery', () => {
  const statuses: OrderStatus[] = [
    'Recibido',
    'En Diagnóstico',
    'Esperando Presupuesto',
    'Esperando Repuesto',
    'En Reparación',
    'Listo',
    'Garantía',
  ];
  for (const status of statuses) {
    const actions = getWorkshopActions(status);
    assert.ok(actions.length > 0, `${status} must have a next action`);
    assert.ok(
      actions.every(
        (action) => action.status !== status && action.label.length > 0
      )
    );
    assert.equal(
      actions.some((action) => action.status === 'Entregado'),
      status === 'Listo'
    );
  }
  assert.deepEqual(getWorkshopActions('Listo'), [
    { status: 'Entregado', label: 'Marcar entregado' },
  ]);
  assert.deepEqual(getWorkshopActions('Entregado'), []);
});

test('PINs preserve leading zeroes and missing access data remains explicit', () => {
  const order = fixture('pin', 'Recibido');
  order.dispositivo.claveBloqueo = '0012';
  order.dispositivo.tipoBloqueo = 'PIN';
  assert.deepEqual(getOrderUnlock(order), {
    label: 'PIN / clave',
    value: '0012',
    points: [],
  });
  order.dispositivo.claveBloqueo = undefined;
  assert.equal(getOrderUnlock(order).value, 'Sin registrar');
  order.dispositivo.tipoBloqueo = 'Ninguno';
  assert.equal(getOrderUnlock(order).value, 'Sin bloqueo');
});

test('pattern diagrams survive reloading legacy text and ignore invalid grid coordinates', () => {
  const order = fixture('pattern', 'En Reparación');
  order.dispositivo.claveBloqueo = 'Patrón [1→2→5→8]';
  assert.deepEqual(getOrderUnlock(order), {
    label: 'Patrón',
    value: '1 → 2 → 5 → 8',
    points: [1, 2, 5, 8],
  });
  order.dispositivo.patronPuntos = [1, 5, 9, 10, 0, 1.5];
  assert.deepEqual(getOrderUnlock(order).points, [1, 5, 9]);
});

test('an empty search result keeps active cards mounted and hidden while delivered cards leave the board', () => {
  const markup = renderToStaticMarkup(
    createElement(MobileWorkshopView, {
      orders: [
        fixture('draft-in-cola', 'En Diagnóstico'),
        fixture('pending-in-mesa', 'En Reparación'),
        fixture('already-delivered', 'Entregado'),
      ],
      searchQuery: 'no-match',
      onSearchChange: () => {},
      onReceiveExpress: () => {},
      onSelectOrder: () => {},
      onUpdateStatus: async () => {},
      onAddPhoto: async () => {},
      onAddNote: async () => {},
      onOpenWhatsApp: () => {},
    })
  );
  // Removing filtered cards from the React tree would also remove their note
  // drafts and pending guards. Keep the hidden instances across every lane.
  for (const id of ['draft-in-cola', 'pending-in-mesa']) {
    assert.match(
      markup,
      new RegExp(
        `<div[^>]*hidden=""[^>]*><article[^>]*aria-label="Orden ${id}"`
      )
    );
  }
  assert.doesNotMatch(markup, /Orden already-delivered/);
  assert.match(markup, /No encontramos equipos con esa búsqueda/);
});

test('the last delivered order keeps an explicit receipt/guarantee offer after leaving the board', () => {
  const delivered = {
    ...fixture('OS-DELIVERED', 'Entregado'),
    fechaEntrega: '2026-10-30T02:00:00.000Z',
    garantiaDias: 90,
  };
  const markup = renderToStaticMarkup(
    createElement(MobileWorkshopView, {
      orders: [delivered],
      searchQuery: '',
      lastDeliveredOrder: delivered,
      onSearchChange: () => {},
      onReceiveExpress: () => {},
      onSelectOrder: () => {},
      onUpdateStatus: async () => {},
      onAddPhoto: async () => {},
      onAddNote: async () => {},
      onOpenWhatsApp: () => {},
      onDeliveryReceipt: () => {},
    })
  );
  assert.match(markup, /Comprobante de la última entrega/);
  assert.match(markup, /Enviar comprobante y garantía/);
  assert.match(markup, /datetime="2026-10-30T02:00:00.000Z"/i);
  assert.match(markup, /90 días de garantía/);
  assert.doesNotMatch(markup, /aria-label="Orden OS-DELIVERED"/);
});

test('drawer delivery option is blocked until ready and delivered records show the saved timestamp', () => {
  const render = (order: Order) =>
    renderToStaticMarkup(
      createElement(DeviceDetailDrawer, {
        order,
        isOpen: true,
        onClose: () => {},
        onUpdateStatus: async () => {},
        onAddNote: async () => {},
        onAssignPart: async () => {},
        onAddPhoto: async () => {},
        onPrintTicket: () => {},
        onOpenWhatsApp: () => {},
        onDeliveryReceipt: () => {},
        inventory: [],
      })
    );
  assert.match(
    render(fixture('received', 'Recibido')),
    /<option[^>]*value="Entregado"[^>]*disabled=""/
  );
  assert.doesNotMatch(
    render(fixture('ready', 'Listo')),
    /<option[^>]*value="Entregado"[^>]*disabled=""/
  );
  const markup = render({
    ...fixture('delivered', 'Entregado'),
    fechaEntrega: '2026-10-30T02:00:00.000Z',
  });
  assert.match(markup, /datetime="2026-10-30T02:00:00.000Z"/i);
  assert.match(markup, /Enviar comprobante y garantía/);
});

test('industrial board renders three simultaneous desktop columns and compact mobile tabs', () => {
  const markup = renderToStaticMarkup(
    createElement(MobileWorkshopView, {
      orders: [
        fixture('OS-DIAG', 'En Diagnóstico'),
        fixture('OS-QUOTE', 'Esperando Presupuesto'),
        fixture('OS-READY', 'Listo'),
      ],
      searchQuery: '',
      onSearchChange() {},
      onReceiveExpress() {},
      onSelectOrder() {},
      async onUpdateStatus() {},
      async onAddPhoto() {},
      async onAddNote() {},
      onOpenWhatsApp() {},
    })
  );
  assert.match(markup, /Laboratorio &amp; Mesa de Trabajo/);
  assert.match(markup, /Todos los activos/);
  assert.match(markup, /Mis asignados/);
  assert.match(markup, /Urgentes/);
  assert.match(markup, /Recepción Rápida/);
  assert.match(
    markup,
    /aria-label="Tablero Kanban de laboratorio"[^>]*lg:grid-cols-3/
  );
  assert.match(
    markup,
    /role="tablist"[^>]*aria-label="Columnas del laboratorio"[^>]*lg:hidden/
  );
  const diagnostic = markup.slice(
    markup.indexOf('id="lab-lane-cola"'),
    markup.indexOf('id="lab-lane-mesa"')
  );
  const workbench = markup.slice(
    markup.indexOf('id="lab-lane-mesa"'),
    markup.indexOf('id="lab-lane-listos"')
  );
  const ready = markup.slice(markup.indexOf('id="lab-lane-listos"'));
  assert.match(diagnostic, /Orden OS-DIAG/);
  assert.doesNotMatch(diagnostic, /Orden OS-QUOTE|Orden OS-READY/);
  assert.match(workbench, /Orden OS-QUOTE/);
  assert.doesNotMatch(workbench, /Orden OS-DIAG|Orden OS-READY/);
  assert.match(ready, /Orden OS-READY/);
  assert.doesNotMatch(markup, /max-w-5xl|w-full[^"]*bg-zinc-100/);
});

test('laboratory filters keep the selected technician and urgent active orders distinct', () => {
  const mine = fixture('mine', 'Recibido');
  const urgent = {
    ...fixture('urgent', 'En Reparación', true),
    tecnico: { nombre: 'Otra persona', iniciales: 'OP' },
  };
  const delivered = fixture('done', 'Entregado', true);
  assert.deepEqual(
    getVisibleWorkshopOrders([mine, urgent, delivered], 'all', '').map(
      (order) => order.id
    ),
    ['mine', 'urgent']
  );
  assert.deepEqual(
    getVisibleWorkshopOrders([mine, urgent, delivered], 'mine', ' ANDRÉS ').map(
      (order) => order.id
    ),
    ['mine']
  );
  assert.deepEqual(
    getVisibleWorkshopOrders([mine, urgent, delivered], 'mine', ''),
    []
  );
  assert.deepEqual(
    getVisibleWorkshopOrders([mine, urgent, delivered], 'urgent', 'Andrés').map(
      (order) => order.id
    ),
    ['urgent']
  );
});

test('industrial cards expose critical pills and compact photo, label and WhatsApp actions', () => {
  const order = {
    ...fixture('OS-CARD', 'Recibido', true),
    ubicacionFisica: 'Gaveta B-04',
    dispositivo: {
      ...fixture('x', 'Recibido').dispositivo,
      claveBloqueo: '0012',
    },
    fotosEvidencia: ['data:image/webp;base64,WA=='],
  };
  const markup = renderToStaticMarkup(
    createElement(MobileWorkshopView, {
      orders: [order],
      searchQuery: '',
      onSearchChange() {},
      onReceiveExpress() {},
      onSelectOrder() {},
      async onUpdateStatus() {},
      async onAddPhoto() {},
      async onAddNote() {},
      onOpenWhatsApp() {},
      async onSaveLocation() {},
      onPrintLabel() {},
    })
  );
  assert.match(markup, /PIN\/Patrón: 0012/);
  assert.match(markup, /Ubicación: Gaveta B-04/);
  assert.match(markup, /aria-label="Urgente"/);
  assert.match(markup, /Tomar foto para OS-CARD/);
  assert.match(markup, /Imprimir etiqueta de equipo/);
  assert.match(markup, /WhatsApp al cliente de OS-CARD/);
  assert.match(markup, /Iniciar diagnóstico/);
  assert.match(markup, /title="Sin imagen por HDMI"[^>]*truncate/);
  assert.doesNotMatch(markup, /w-\[88px\]|h-\[88px\]/);
});
