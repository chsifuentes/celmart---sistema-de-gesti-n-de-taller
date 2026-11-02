import assert from 'node:assert/strict';
import test from 'node:test';
import { access, readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
test('SDD source of truth records the palette, typography, auth and industrial board contracts', async () => {
  const spec = await readFile(new URL('SPEC.md', root), 'utf8');
  for (const token of [
    'SPEC 1.1',
    'SPEC 1.2',
    'SPEC 1.3',
    'SPEC 1.4',
    '#0c0c0e',
    '#161619',
    '#111114',
    '#1c1c20',
    'Plus Jakarta Sans',
    'JetBrains Mono',
    'getSession()',
    'supabase_schema.sql',
  ])
    assert.ok(spec.includes(token), token);
});
test('simple controls have no detached component files and the schema has one canonical SQL source', async () => {
  for (const name of [
    'LocationControl',
    'OrderOperations',
    'WhatsAppConnectionControl',
  ])
    await assert.rejects(access(new URL(`src/components/${name}.tsx`, root)));
  async function sqlFiles(dir: URL): Promise<string[]> {
    const found: string[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'dist', '.temp', 'coverage', 'sesion_whatsapp'].includes(entry.name)) continue;
      const file = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) found.push(...(await sqlFiles(file)));
      else if (entry.name.endsWith('.sql')) found.push(file.pathname);
    }
    return found;
  }
  const sql = await sqlFiles(root);
  assert.equal(sql.length, 1);
  assert.ok(sql[0].endsWith('/supabase_schema.sql'));
});
