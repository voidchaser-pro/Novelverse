import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const EPUB_BUCKET = 'epubs';
const COVERS_BUCKET = 'covers';

/**
 * Uploads an EPUB file to Supabase Storage (private bucket).
 * Returns the storage path on success, null on failure.
 */
export async function uploadEpubFile(
  file: File,
  submissionId: string
): Promise<string | null> {
  if (!supabase || !isSupabaseConfigured) return null;

  const ext = file.name.split('.').pop() || 'epub';
  const path = `${submissionId}/original.${ext}`;
  const { error } = await supabase.storage
    .from(EPUB_BUCKET)
    .upload(path, file, { upsert: true });

  if (error) {
    console.error('Failed to upload EPUB:', error.message);
    return null;
  }

  return path;
}

/**
 * Uploads a cover image (as Blob or data URL) to Supabase Storage (public bucket).
 * Returns the public URL on success, or the data URL fallback if Supabase is not available.
 */
export async function uploadCoverImage(
  coverInput: Blob | string,
  submissionId: string,
  mimeType: string = 'image/jpeg'
): Promise<string> {
  let blob: Blob;
  if (typeof coverInput === 'string') {
    blob = dataUrlToBlob(coverInput);
    mimeType = blob.type || mimeType;
  } else {
    blob = coverInput;
  }

  if (!supabase || !isSupabaseConfigured) {
    return await blobToDataUrl(blob);
  }

  const ext = mimeType.split('/')[1]?.split('+')[0] || 'jpg';
  const path = `${submissionId}/cover.${ext}`;
  const { error } = await supabase.storage
    .from(COVERS_BUCKET)
    .upload(path, blob, { upsert: true, contentType: mimeType });

  if (error) {
    console.error('Failed to upload cover:', error.message);
    return await blobToDataUrl(blob);
  }

  const { data } = supabase.storage.from(COVERS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Gets the public URL for a stored cover image.
 */
export function getCoverPublicUrl(submissionId: string, ext: string = 'jpg'): string | null {
  if (!supabase || !isSupabaseConfigured) return null;
  const { data } = supabase.storage
    .from(COVERS_BUCKET)
    .getPublicUrl(`${submissionId}/cover.${ext}`);
  return data.publicUrl;
}

/**
 * Creates a signed URL for downloading a private EPUB file.
 */
export async function getEpubSignedUrl(storagePath: string): Promise<string | null> {
  if (!supabase || !isSupabaseConfigured) return null;
  const { data, error } = await supabase.storage
    .from(EPUB_BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error) {
    console.error('Failed to create signed URL:', error.message);
    return null;
  }
  return data.signedUrl;
}

/**
 * Deletes an EPUB file from storage.
 */
export async function deleteEpubFile(storagePath: string): Promise<boolean> {
  if (!supabase || !isSupabaseConfigured) return false;
  const { error } = await supabase.storage.from(EPUB_BUCKET).remove([storagePath]);
  return !error;
}

/**
 * Converts a data URL string to a Blob.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(',');
  const mimeMatch = meta.match(/data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    arr[i] = bytes.charCodeAt(i);
  }
  return new Blob([arr], { type: mime });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
