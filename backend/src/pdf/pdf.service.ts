import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { imageSize } from 'image-size';
import PDFDocument from 'pdfkit';
import { Writable } from 'stream';
import { Question } from '../common/question.interface';

const MARGIN = 40;
const IMAGE_TIMEOUT_MS = 10000;

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  /**
   * Renders the questions into a two-column PDF and pipes it to `output`
   * (typically the HTTP response). Resolves once the document is finalized.
   */
  async streamQuestionsPdf(
    questions: Question[],
    output: Writable,
  ): Promise<void> {
    const doc = new PDFDocument({ margin: MARGIN });
    doc.pipe(output);
    doc.font('Helvetica');

    const pageHeight = doc.page.height;
    const columnWidth = (doc.page.width - MARGIN * 3) / 2;
    const rightColumnX = MARGIN + columnWidth + MARGIN;

    let leftY = MARGIN;
    let rightY = MARGIN;

    for (const question of questions) {
      const leftSpace = pageHeight - MARGIN - leftY;
      const rightSpace = pageHeight - MARGIN - rightY;
      let useLeftColumn = leftSpace >= rightSpace;

      let x = useLeftColumn ? MARGIN : rightColumnX;
      let currentY = useLeftColumn ? leftY : rightY;

      const estimatedHeight = this.estimateQuestionHeight(
        doc,
        question,
        columnWidth,
      );

      // Doesn't fit in the chosen column? Try the other one.
      if (currentY + estimatedHeight > pageHeight - MARGIN) {
        useLeftColumn = !useLeftColumn;
        x = useLeftColumn ? MARGIN : rightColumnX;
        currentY = useLeftColumn ? leftY : rightY;

        // Still doesn't fit? Start a fresh page.
        if (currentY + estimatedHeight > pageHeight - MARGIN) {
          doc.addPage();
          leftY = MARGIN;
          rightY = MARGIN;
          useLeftColumn = true;
          x = MARGIN;
          currentY = leftY;
        }
      }

      const finalY = await this.renderQuestion(
        doc,
        question,
        x,
        currentY,
        columnWidth,
        pageHeight,
      );

      if (useLeftColumn) {
        leftY = finalY + 20;
      } else {
        rightY = finalY + 20;
      }
    }

    doc.end();

    await new Promise<void>((resolve, reject) => {
      output.on('finish', resolve);
      output.on('error', reject);
    });
  }

  private estimateQuestionHeight(
    doc: PDFKit.PDFDocument,
    question: Question,
    columnWidth: number,
  ): number {
    let height = 20; // title

    if (question.context) {
      const cleanContext = this.cleanText(question.context);
      if (cleanContext) {
        height +=
          doc.heightOfString(cleanContext, {
            width: columnWidth,
            align: 'justify',
          }) + 10;
      }
      if (this.extractImageUrl(question.context)) {
        height += 100;
      }
    }

    if (question.alternativesIntroduction) {
      height +=
        doc.heightOfString(question.alternativesIntroduction, {
          width: columnWidth,
        }) + 10;
    }

    for (const alt of question.alternatives) {
      if (this.extractImageUrl(alt.text ?? alt.file)) {
        height += 80;
      } else {
        const altText = `${alt.letter}) ${this.cleanText(alt.text)}`;
        height +=
          doc.heightOfString(altText, {
            width: columnWidth,
            align: 'justify',
          }) + 5;
      }
    }

    return height + 15;
  }

  private async renderQuestion(
    doc: PDFKit.PDFDocument,
    question: Question,
    x: number,
    startY: number,
    columnWidth: number,
    pageHeight: number,
  ): Promise<number> {
    let currentY = startY;
    const maxY = pageHeight - MARGIN;

    // Title
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text(question.title, x, currentY, { width: columnWidth, align: 'left' });
    currentY += 20;

    // Context (+ optional image)
    if (question.context) {
      const imageUrl = this.extractImageUrl(question.context);
      const cleanContext = this.cleanText(question.context);

      doc.fontSize(10).font('Helvetica');

      if (cleanContext) {
        const textHeight = doc.heightOfString(cleanContext, {
          width: columnWidth,
          align: 'justify',
        });
        if (currentY + textHeight <= maxY) {
          doc.text(cleanContext, x, currentY, {
            width: columnWidth,
            align: 'justify',
          });
          currentY += textHeight + 10;
        }
      }

      if (imageUrl && currentY < maxY - 100) {
        currentY += 5;
        const imageHeight = await this.addImage(
          doc,
          imageUrl,
          x,
          currentY,
          columnWidth,
        );
        currentY += imageHeight + 10;
      }
    }

    // Alternatives introduction
    if (question.alternativesIntroduction && currentY < maxY - 30) {
      const introHeight = doc.heightOfString(
        question.alternativesIntroduction,
        { width: columnWidth },
      );
      if (currentY + introHeight <= maxY) {
        doc.text(question.alternativesIntroduction, x, currentY, {
          width: columnWidth,
          align: 'justify',
        });
        currentY += introHeight + 10;
      }
    }

    // Alternatives
    doc.fontSize(10);
    for (const alt of question.alternatives) {
      if (currentY > maxY - 30) {
        break;
      }

      const altImageUrl = this.extractImageUrl(alt.text ?? alt.file);
      const cleanAltText = this.cleanText(alt.text);

      if (altImageUrl) {
        doc.text(`${alt.letter}) `, x, currentY);
        const textWidth = doc.widthOfString(`${alt.letter}) `);
        if (currentY > maxY - 100) {
          break;
        }
        const imageHeight = await this.addImage(
          doc,
          altImageUrl,
          x + textWidth,
          currentY - 2,
          columnWidth - textWidth - 5,
          60,
        );
        currentY += Math.max(20, imageHeight) + 8;
      } else if (cleanAltText) {
        const altText = `${alt.letter}) ${cleanAltText}`;
        const altHeight = doc.heightOfString(altText, {
          width: columnWidth,
          align: 'justify',
        });
        if (currentY + altHeight > maxY) {
          break;
        }
        doc.text(altText, x, currentY, {
          width: columnWidth,
          align: 'justify',
        });
        currentY += altHeight + 5;
      }
    }

    return currentY;
  }

  /** Strips HTML/markdown noise and normalizes whitespace. */
  private cleanText(text: string | null | undefined): string {
    if (!text) return '';
    return text
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/<img[^>]*>/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/\s+/g, ' ')
      .replace(/\\n/g, '\n')
      .trim();
  }

  /** Finds the first image URL inside markdown/HTML/plain text. */
  private extractImageUrl(text: string | null | undefined): string | null {
    if (!text) return null;
    const patterns = [
      /!\[.*?\]\((.*?)\)/,
      /<img[^>]+src="([^">]+)"/,
      /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|bmp|webp|svg))/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        return match[1].trim();
      }
    }
    return null;
  }

  private async addImage(
    doc: PDFKit.PDFDocument,
    imageUrl: string,
    x: number,
    y: number,
    maxWidth: number,
    maxHeight = 60,
  ): Promise<number> {
    try {
      const response = await axios.get<ArrayBuffer>(imageUrl, {
        responseType: 'arraybuffer',
        timeout: IMAGE_TIMEOUT_MS,
      });
      const buffer = Buffer.from(response.data);
      const { width: iw, height: ih } = imageSize(buffer);

      const ratio = Math.min(maxWidth / iw, maxHeight / ih, 1);
      const width = iw * ratio;
      const height = ih * ratio;

      doc.image(buffer, x, y + 2, { width, height });
      return height;
    } catch (error) {
      this.logger.warn(`Failed to load image ${imageUrl}: ${String(error)}`);
      doc.fontSize(8).text('[Imagem]', x, y);
      return 12;
    }
  }
}
