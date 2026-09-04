const test = require('node:test');
const assert = require('node:assert/strict');
const { createAssetStorage, MAX_ASSET_BYTES, ALLOWED_TYPES } = require('../src/asset-storage');

test('asset storage stays disabled until Supabase secrets are configured', async () => {
  const storage = createAssetStorage({ url: '', serviceRoleKey: '', bucket: 'exam-assets' });
  assert.equal(storage.configured, false);
  assert.equal(storage.maxBytes, MAX_ASSET_BYTES);
  assert.ok(ALLOWED_TYPES.has('image/png'));
  await assert.rejects(() => storage.upload({ buffer: Buffer.from('x'), contentType: 'image/png', fileName: 'x.png', owner: 'admin' }), { code: 'storage_not_configured' });
});

test('asset storage reports an unreachable Supabase host as a friendly error, not raw "fetch failed"', async () => {
  const storage = createAssetStorage({ url: 'https://this-host-does-not-exist.invalid', serviceRoleKey: 'test-key', bucket: 'exam-assets' });
  await assert.rejects(
    () => storage.upload({ buffer: Buffer.from('x'), contentType: 'image/png', fileName: 'x.png', owner: 'admin' }),
    error => {
      assert.equal(error.code, 'storage_unreachable');
      assert.notEqual(error.message, 'fetch failed');
      assert.match(error.message, /Supabase Storage/);
      return true;
    }
  );
});
