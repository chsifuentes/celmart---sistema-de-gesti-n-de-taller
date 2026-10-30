import assert from 'node:assert/strict';
import test from 'node:test';
import { compressImageToWebP, uploadWorkshopPhoto } from '../src/lib/imageStorage';
import { createMockSupabaseClient } from '../src/lib/supabase';

function browserStubs(width: number, height: number, outputType = 'image/webp') {
  const original = Object.fromEntries(['FileReader', 'Image', 'document'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const encoded: { width?: number; height?: number; quality?: number; type?: string } = {};
  class Reader {
    result: string | null = null;
    onload?: () => void;
    readAsDataURL(blob: Blob) {
      blob.arrayBuffer().then((bytes) => {
        this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;
        this.onload?.();
      });
    }
  }
  class TestImage {
    naturalWidth = width;
    naturalHeight = height;
    onload?: () => void;
    set src(value: string) { if (value) queueMicrotask(() => this.onload?.()); }
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage() {} }),
    toBlob(callback: (blob: Blob) => void, type: string, quality: number) {
      Object.assign(encoded, { width: this.width, height: this.height, type, quality });
      callback(new Blob(['compressed'], { type: outputType }));
    },
  };
  Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: Reader });
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: TestImage });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => canvas } });
  return {
    encoded,
    cleanup() {
      for (const [key, descriptor] of Object.entries(original)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

test('compression keeps aspect ratio and requests WebP at the agreed limits', async () => {
  const browser = browserStubs(4000, 3000);
  try {
    const blob = await compressImageToWebP(new File(['source'], 'evidence.jpg', { type: 'image/jpeg' }));
    assert.equal(blob.type, 'image/webp');
    assert.deepEqual(browser.encoded, { width: 1200, height: 900, type: 'image/webp', quality: 0.72 });
  } finally { browser.cleanup(); }
});

test('small photos are never enlarged and demo upload yields compressed DataURL', async () => {
  const browser = browserStubs(640, 480);
  try {
    const url = await uploadWorkshopPhoto(new File(['source'], 'small.png', { type: 'image/png' }), 'ordenes', 'OS-1');
    assert.ok(url?.startsWith('data:image/webp;base64,'));
    assert.equal(browser.encoded.width, 640);
    assert.equal(browser.encoded.height, 480);
  } finally { browser.cleanup(); }
});

test('unsupported WebP encoding fails instead of uploading a mislabeled PNG', async () => {
  const browser = browserStubs(640, 480, 'image/png');
  try {
    await assert.rejects(compressImageToWebP(new File(['source'], 'small.png', { type: 'image/png' })), /WebP/);
  } finally { browser.cleanup(); }
});

test('mock Storage simulates uploads, public URLs and duplicate rejection', async () => {
  const browser = browserStubs(640, 480);
  try {
    const bucket = createMockSupabaseClient().storage.from('taller-media');
    const compressed = new Blob(['compressed'], { type: 'image/webp' });
    assert.equal((await bucket.upload('ordenes/demo.webp', compressed)).error, null);
    assert.ok(bucket.getPublicUrl('ordenes/demo.webp').data.publicUrl.startsWith('data:image/webp;base64,'));
    assert.ok((await bucket.upload('ordenes/demo.webp', compressed)).error);
    await bucket.remove(['ordenes/demo.webp']);
    assert.equal(bucket.getPublicUrl('ordenes/demo.webp').data.publicUrl, '');
  } finally { browser.cleanup(); }
});

test('non-image files and invalid compression parameters are rejected', async () => {
  await assert.rejects(compressImageToWebP(new File(['test'], 'test.txt', { type: 'text/plain' })), /imagen/);
  await assert.rejects(compressImageToWebP(new File(['test'], 'test.jpg', { type: 'image/jpeg' }), 0), /ancho/);
});
