import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'HTMLElement', 'Node', 'Event', 'KeyboardEvent']) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: (dom.window as unknown as Record<string, unknown>)[key],
  });
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { Header } = await import('../src/components/Header');
const props = {
  globalSearch: '', setGlobalSearch() {}, onOpenNewOrder() {}, urgentOrdersCount: 0,
  viewMode: 'recepcion' as const, onViewModeChange() {},
};

test('Ctrl+K and Meta+K focus the same compact global search and release their listeners', async () => {
  const host = document.createElement('div');
  const outside = document.createElement('button');
  document.body.append(host, outside);
  const root = createRoot(host);
  await React.act(() => root.render(React.createElement(Header, props)));
  const input = host.querySelector<HTMLInputElement>('#global-search-input')!;
  try {
    for (const modifier of ['ctrlKey', 'metaKey'] as const) {
      outside.focus();
      const event = new KeyboardEvent('keydown', { key: 'k', [modifier]: true, bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      assert.equal(document.activeElement, input);
      assert.equal(event.defaultPrevented, true);
    }
    outside.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, isComposing: true }));
    assert.equal(document.activeElement, outside);
    assert.equal(host.querySelector('select'), null);
    assert.equal(host.querySelectorAll('input').length, 1);
    assert.ok(host.querySelector('header')?.classList.contains('h-16'));
  } finally {
    await React.act(() => root.unmount());
    host.remove();
  }
  outside.focus();
  const afterUnmount = new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true });
  window.dispatchEvent(afterUnmount);
  assert.equal(afterUnmount.defaultPrevented, false);
  assert.equal(document.activeElement, outside);
  outside.remove();
});

test('Enter submits the literal current folio or SKU once and composition never submits', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const submitted: string[] = [];
  const render = async (query: string) => {
    await React.act(() => root.render(React.createElement(Header, { ...props, globalSearch: query, onSearchSubmit: (value) => submitted.push(value) })));
    return host.querySelector<HTMLInputElement>('#global-search-input')!;
  };
  try {
    for (const query of ['OS-2401', 'OS-2401-G1', 'OS-2401-ABC123EF-G2', '  FLEX-USB-C  ']) {
      const input = await render(query);
      await React.act(() => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true }));
      });
      assert.equal(submitted.length, ['OS-2401', 'OS-2401-G1', 'OS-2401-ABC123EF-G2', '  FLEX-USB-C  '].indexOf(query));
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      await React.act(() => input.dispatchEvent(event));
      assert.equal(submitted.at(-1), query);
      assert.equal(event.defaultPrevented, true);
    }
    assert.equal(submitted.length, 4);
  } finally {
    await React.act(() => root.unmount());
    host.remove();
  }
});
