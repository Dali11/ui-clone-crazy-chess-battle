"use client";

// Client-side image compression before upload: downscale to max 1280px on
// the longest side, JPEG q0.8. Keeps mobile uploads small (photos are
// routinely 4-8MB); 8MB hard guard is a fallback for exotic files.

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export interface Compressed {
  blob: Blob;
  width: number;
  height: number;
}

export async function compressImage(file: File): Promise<Compressed> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.8));
  if (!blob) throw new Error("compression failed");
  if (blob.size > MAX_IMAGE_BYTES) throw new Error("image too large");
  return { blob, width: w, height: h };
}
