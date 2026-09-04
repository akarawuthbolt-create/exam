const path = require('path');
const { newId } = require('./ids');

const MAX_ASSET_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip']);

function safeFileName(name) {
  const ext = path.extname(String(name || '')).toLowerCase().replace(/[^.a-z0-9]/g, '');
  return `${newId('asset')}${ext}`;
}

const STORAGE_TIMEOUT_MS = 15_000;
// Supabase Storage requires both apikey and Authorization headers, and Authorization must be a
// real JWT (it rejects the request with "headers must have required property 'authorization'" if
// missing, and with "Invalid Compact JWS" if present but not JWT-shaped). Only the legacy
// service_role key is a JWT; the new sb_secret_... key format is an opaque string and is not
// accepted as Authorization by this endpoint, even though it works fine as apikey.
const JWT_PATTERN = /^[\w-]+\.[\w-]+\.[\w-]+$/;

function createAssetStorage({ url, serviceRoleKey, bucket }) {
  const configured = Boolean(url && serviceRoleKey);
  const isLegacyJwtKey = JWT_PATTERN.test(String(serviceRoleKey || ''));
  const headers = () => ({ apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` });

  async function storageFetch(input, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STORAGE_TIMEOUT_MS);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (error?.name === 'AbortError') throw Object.assign(new Error('เชื่อมต่อพื้นที่เก็บไฟล์ (Supabase Storage) หมดเวลา กรุณาลองใหม่'), { code: 'storage_unreachable' });
      throw Object.assign(new Error('ไม่สามารถเชื่อมต่อพื้นที่เก็บไฟล์ (Supabase Storage) ได้ กรุณาตรวจสอบการตั้งค่า SUPABASE_URL และการเชื่อมต่อเครือข่าย'), { code: 'storage_unreachable', cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  function invalidKeyFormatHint(detail) {
    if (isLegacyJwtKey || !/compact jws/i.test(detail)) return '';
    return ' — SUPABASE_SECRET_KEY ที่ตั้งไว้เป็น key รูปแบบใหม่ (sb_secret_...) ซึ่ง Supabase Storage ยังไม่รองรับสำหรับสร้างพื้นที่เก็บไฟล์ กรุณาใช้ legacy "service_role" key (รูปแบบ JWT, Settings > API ในหน้า Supabase) แทน';
  }

  async function ensureBucket() {
    const response = await storageFetch(`${url}/storage/v1/bucket`, { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ id: bucket, name: bucket, public: true, file_size_limit: MAX_ASSET_BYTES, allowed_mime_types: [...ALLOWED_TYPES] }) });
    if (response.ok || response.status === 409) return;
    const detail = await response.text().catch(() => '');
    // Supabase Storage sometimes reports a duplicate bucket with HTTP 400 and a body
    // code of BucketAlreadyExists/Duplicate instead of an actual HTTP 409 — treat that
    // as success too, since the bucket already existing is exactly what we want.
    if (/BucketAlreadyExists/i.test(detail) || /"statusCode"\s*:\s*"?409"?/.test(detail)) return;
    throw Object.assign(new Error(`ไม่สามารถสร้างพื้นที่เก็บไฟล์ได้ (HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''})${invalidKeyFormatHint(detail)}`), { code: 'storage_bucket_failed' });
  }

  async function upload({ buffer, contentType, fileName, owner }) {
    if (!configured) throw Object.assign(new Error('ยังไม่ได้ตั้งค่า Supabase Storage'), { code: 'storage_not_configured' });
    if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_ASSET_BYTES) throw Object.assign(new Error('ไฟล์ต้องมีขนาดไม่เกิน 5 MB'), { code: 'invalid_file' });
    if (!ALLOWED_TYPES.has(contentType)) throw Object.assign(new Error('ชนิดไฟล์นี้ไม่รองรับ'), { code: 'invalid_file_type' });
    await ensureBucket();
    const objectPath = `${owner}/${safeFileName(fileName)}`;
    const response = await storageFetch(`${url}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath.split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', headers: { ...headers(), 'Content-Type': contentType, 'x-upsert': 'false' }, body: buffer });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw Object.assign(new Error(`อัปโหลดไฟล์ไม่สำเร็จ (HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''})${invalidKeyFormatHint(detail)}`), { code: 'storage_upload_failed' });
    }
    return { name: String(fileName || 'attachment'), type: contentType, size: buffer.length, url: `${url}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath}` };
  }

  return { configured, upload, maxBytes: MAX_ASSET_BYTES, allowedTypes: [...ALLOWED_TYPES] };
}

module.exports = { createAssetStorage, MAX_ASSET_BYTES, ALLOWED_TYPES };
