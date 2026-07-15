import { Logger } from '@nestjs/common';
import axios from 'axios';
import { imageSize } from 'image-size';

const IMAGE_TIMEOUT_MS = 10000;
const MAX_CONCURRENT_DOWNLOADS = 8;

export interface LoadedImage {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Downloads and measures every image up front so the PDF layout can use real
 * dimensions instead of guessing. Layout needs an image's height *before* it
 * decides which column the question goes in, so this has to happen first.
 *
 * Past exams never change, so the cache lives for the process lifetime.
 */
export class ImageLoader {
  private readonly logger = new Logger(ImageLoader.name);
  private readonly cache = new Map<string, LoadedImage | null>();

  /** Fetches any url not already cached. Failures cache as `null`. */
  async preload(urls: string[]): Promise<void> {
    const pending = [...new Set(urls)].filter((url) => !this.cache.has(url));

    for (let i = 0; i < pending.length; i += MAX_CONCURRENT_DOWNLOADS) {
      const batch = pending.slice(i, i + MAX_CONCURRENT_DOWNLOADS);
      await Promise.all(batch.map((url) => this.fetch(url)));
    }
  }

  /** Returns a preloaded image, or null if it is missing or failed to load. */
  get(url: string): LoadedImage | null {
    return this.cache.get(url) ?? null;
  }

  private async fetch(url: string): Promise<void> {
    try {
      const response = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: IMAGE_TIMEOUT_MS,
      });
      const buffer = Buffer.from(response.data);
      const { width, height, type } = imageSize(buffer);

      // pdfkit only embeds JPEG and PNG; anything else would throw at render.
      if (type !== 'jpg' && type !== 'png') {
        this.logger.warn(`Unsupported image type "${type}" at ${url}`);
        this.cache.set(url, null);
        return;
      }

      if (!width || !height) {
        this.cache.set(url, null);
        return;
      }

      this.cache.set(url, { buffer, width, height });
    } catch (error) {
      this.logger.warn(`Failed to load image ${url}: ${String(error)}`);
      this.cache.set(url, null);
    }
  }
}
