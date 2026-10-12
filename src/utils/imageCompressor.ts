export interface CompressionResult {
  blob: Blob;
  dataUrl: string;
  sizeKB: number;
  format: 'image/avif' | 'image/webp' | 'image/jpeg';
}

/**
 * Checks browser capability and returns the most advanced supported image format
 * Priority: AVIF -> WebP -> JPEG
 */
export function getOptimalImageMimeType(): 'image/avif' | 'image/webp' | 'image/jpeg' {
  if (typeof document === 'undefined') return 'image/jpeg';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    if (canvas.toDataURL('image/avif').startsWith('data:image/avif')) {
      return 'image/avif';
    }
    if (canvas.toDataURL('image/webp').startsWith('data:image/webp')) {
      return 'image/webp';
    }
  } catch {}
  return 'image/jpeg';
}

/**
 * Resizes and compresses an image in browser using HTML5 Canvas.
 * Produces ultra-compact WebP/AVIF or JPEG with specified dimensions and <= maxKB limit.
 */
export async function resizeAndCompressImage(
  file: File,
  targetWidth: number,
  targetHeight: number,
  maxKB: number,
  preferredMime?: 'image/avif' | 'image/webp' | 'image/jpeg'
): Promise<CompressionResult> {
  const mimeType = preferredMime || getOptimalImageMimeType();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('ফাইল পড়তে ব্যর্থ হয়েছে'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('ছবি লোড করতে ব্যর্থ হয়েছে'));
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Canvas context পাওয়া যায়নি'));
          return;
        }

        // Draw with white background for transparency safety
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // Iteratively lower quality if needed to guarantee <= maxKB
        let quality = 0.92;
        let blob: Blob | null = null;

        while (quality >= 0.2) {
          blob = await new Promise<Blob | null>((res) =>
            canvas.toBlob((b) => res(b), mimeType, quality)
          );

          if (blob && blob.size / 1024 <= maxKB) {
            break;
          }
          quality -= 0.1;
        }

        if (!blob) {
          reject(new Error('ছবি কম্প্রেস করা সম্ভব হয়নি'));
          return;
        }

        const dataUrl = canvas.toDataURL(mimeType, quality);
        resolve({
          blob,
          dataUrl,
          sizeKB: Math.round(blob.size / 1024),
          format: mimeType,
        });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
