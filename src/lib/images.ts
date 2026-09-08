/**
 * Photo compression for uploads.
 *
 * A modern phone camera produces 3–8 MB JPEGs at 4000px wide. Nobody needs
 * that to identify a gold bangle or read an Aadhaar card, and the Supabase
 * free tier only gives 1 GB of storage — roughly 200 raw photos, but several
 * thousand once they go through here.
 *
 * Resizing is what actually saves the space; the quality setting alone barely
 * dents a full-resolution image.
 */

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { logError } from './errors';

/** Ornament shots: identification only, never printed large. */
const ITEM_MAX_EDGE = 1280;
/** KYC documents: need to stay readable, so a little more room. */
const KYC_MAX_EDGE = 1600;

const QUALITY = 0.6;

export type PhotoKind = 'items' | 'kyc';

export interface CompressedPhoto {
  base64: string;
  /** Approximate byte size of the encoded JPEG. */
  bytes: number;
  width: number;
  height: number;
}

/** Base64 chars -> bytes, ignoring padding. */
function approximateBytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Resizes to fit inside a max edge and re-encodes as JPEG.
 *
 * Only ever scales down — a small photo is passed through at its own size
 * rather than being blown up.
 */
export async function compressForUpload(
  uri: string,
  kind: PhotoKind,
  sourceWidth?: number,
  sourceHeight?: number
): Promise<CompressedPhoto> {
  const maxEdge = kind === 'kyc' ? KYC_MAX_EDGE : ITEM_MAX_EDGE;

  const context = ImageManipulator.manipulate(uri);

  // Resize by the longer edge so portrait and landscape both land within
  // budget; passing only one dimension keeps the aspect ratio intact.
  const longestEdge = Math.max(sourceWidth ?? 0, sourceHeight ?? 0);
  if (longestEdge === 0 || longestEdge > maxEdge) {
    const isLandscape = (sourceWidth ?? 0) >= (sourceHeight ?? 0);
    context.resize(isLandscape ? { width: maxEdge } : { height: maxEdge });
  }

  const image = await context.renderAsync();
  const result = await image.saveAsync({
    compress: QUALITY,
    format: SaveFormat.JPEG,
    base64: true,
  });

  if (!result.base64) {
    throw new Error('Could not process that photo. Please try taking it again.');
  }

  return {
    base64: result.base64,
    bytes: approximateBytes(result.base64),
    width: result.width,
    height: result.height,
  };
}

/**
 * Compresses, but falls back to the original bytes if the image library fails
 * on some device-specific format. Attaching a large photo beats losing it.
 */
export async function compressForUploadSafe(
  uri: string,
  kind: PhotoKind,
  fallbackBase64: string | undefined,
  sourceWidth?: number,
  sourceHeight?: number
): Promise<CompressedPhoto> {
  try {
    return await compressForUpload(uri, kind, sourceWidth, sourceHeight);
  } catch (error) {
    logError('images.compressForUpload', error);
    if (!fallbackBase64) throw error;
    return {
      base64: fallbackBase64,
      bytes: approximateBytes(fallbackBase64),
      width: sourceWidth ?? 0,
      height: sourceHeight ?? 0,
    };
  }
}

/** e.g. "182 KB" — used in the upload confirmation toast. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
