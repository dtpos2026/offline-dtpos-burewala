// Tenant-scoped image storage — local only in the offline build.
// Path: tenants/{uid}/images/{prefix}-{timestamp}-{rand}.{ext}
// Returns permanent download URL (saved in the cloud as plain string).

import { ref, uploadBytes, getDownloadURL, deleteObject } from '@/lib/offlineNoCloud';
import { cloudStorage, isCloudConfigured } from './offlineNoCloud';
import { getTenantId } from './tenant';

const MAX_BYTES = 2 * 1024 * 1024; // 2MB

async function compressImage(file: File, maxDim = 800, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(b => {
        URL.revokeObjectURL(url);
        b ? resolve(b) : reject(new Error('Compress failed'));
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Invalid image')); };
    img.src = url;
  });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Read failed'));
    reader.readAsDataURL(blob);
  });
}

export async function uploadTenantImage(file: File, prefix: string): Promise<string> {
  if (file.size > MAX_BYTES * 4) throw new Error('Image too large (max 8MB)');

  // Offline build: compress + store as a base64 data URL in the local doc.
  if (!isCloudConfigured()) {
    const blob = await compressImage(file, 600, 0.75).catch(() => file);
    return await blobToDataUrl(blob);
  }

  const tid = getTenantId();
  if (!tid) throw new Error('No tenant');
  if (file.size > MAX_BYTES) throw new Error('Image too large (max 2MB)');

  const blob = await compressImage(file).catch(() => file);
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `tenants/${tid}/images/${prefix}-${ts}-${rand}.jpg`;
  const r = ref(cloudStorage(), path);
  await uploadBytes(r, blob, { contentType: 'image/jpeg' });
  return await getDownloadURL(r);
}

export async function deleteTenantImage(url: string): Promise<void> {
  if (!url || !url.startsWith('https://')) return;
  try {
    const r = ref(cloudStorage(), url);
    await deleteObject(r);
  } catch { /* non-fatal */ }
}
