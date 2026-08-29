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

export class ImageLoader {
  private readonly logger = new Logger(ImageLoader.name);
  private readonly cache = new Map<string, LoadedImage | null>();

  async preload(urls: string[]): Promise<void> {
    const pending = [...new Set(urls)].filter((url) => !this.cache.has(url));

    for (let i = 0; i < pending.length; i += MAX_CONCURRENT_DOWNLOADS) {
      const batch = pending.slice(i, i + MAX_CONCURRENT_DOWNLOADS);
      await Promise.all(batch.map((url) => this.fetch(url)));
    }
  }

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
