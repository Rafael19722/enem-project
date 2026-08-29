import { Injectable } from '@nestjs/common';
import { join } from 'path';
import PDFDocument from 'pdfkit';
import { Writable } from 'stream';
import {
  alternativeSegments,
  cleanText,
  ContentSegment,
  contextSegments,
} from '../common/question-content';
import { Alternative, Question } from '../common/question';
import { ImageLoader, LoadedImage } from './image-loader';

const MARGIN = 40;
const QUESTION_GAP = 20;
const SEGMENT_GAP = 10;

const FONTS_DIR = join(__dirname, 'fonts');
const FONT_REGULAR = 'body';
const FONT_BOLD = 'body-bold';

const CONTEXT_MAX_HEIGHT_RATIO = 0.4;
const ALTERNATIVE_TARGET_HEIGHT = 46;
const ALTERNATIVE_MAX_UPSCALE = 1.5;

interface Size {
  width: number;
  height: number;
}

@Injectable()
export class PdfService {
  private readonly images = new ImageLoader();

  async streamQuestionsPdf(
    questions: Question[],
    output: Writable,
  ): Promise<void> {
    await this.images.preload(this.collectImageUrls(questions));

    const doc = new PDFDocument({ margin: MARGIN });
    doc.pipe(output);
    doc.registerFont(FONT_REGULAR, join(FONTS_DIR, 'DejaVuSans.ttf'));
    doc.registerFont(FONT_BOLD, join(FONTS_DIR, 'DejaVuSans-Bold.ttf'));
    doc.font(FONT_REGULAR);

    const placed = this.layout(doc, questions);
    this.renderAnswerKey(doc, placed);

    doc.end();

    await new Promise<void>((resolve, reject) => {
      output.on('finish', resolve);
      output.on('error', reject);
    });
  }

  private layout(doc: PDFKit.PDFDocument, questions: Question[]): Question[] {
    const pageHeight = doc.page.height;
    const columnWidth = (doc.page.width - MARGIN * 3) / 2;
    const rightColumnX = MARGIN + columnWidth + MARGIN;
    const columnHeight = pageHeight - MARGIN * 2;

    const heights = new Map<Question, number>(
      questions.map((q) => [
        q,
        this.measureQuestion(doc, q, columnWidth, pageHeight),
      ]),
    );

    const pending = [...questions];
    const placed: Question[] = [];
    let leftY = MARGIN;
    let rightY = MARGIN;

    const place = (question: Question, x: number, y: number): number => {
      const end = this.renderQuestion(
        doc,
        question,
        x,
        y,
        columnWidth,
        pageHeight,
      );
      pending.splice(pending.indexOf(question), 1);
      placed.push(question);
      return end + QUESTION_GAP;
    };

    while (pending.length > 0) {
      const columns =
        pageHeight - MARGIN - leftY >= pageHeight - MARGIN - rightY
          ? ([
              [MARGIN, leftY, true],
              [rightColumnX, rightY, false],
            ] as const)
          : ([
              [rightColumnX, rightY, false],
              [MARGIN, leftY, true],
            ] as const);

      let progressed = false;

      for (const [x, y, isLeft] of columns) {
        const available = pageHeight - MARGIN - y;
        const next = pending.find((q) => heights.get(q)! <= available);
        if (!next) continue;

        const end = place(next, x, y);
        if (isLeft) leftY = end;
        else rightY = end;
        progressed = true;
        break;
      }

      if (progressed) continue;

      doc.addPage();
      leftY = MARGIN;
      rightY = MARGIN;

      const oversized = pending[0];
      if (heights.get(oversized)! > columnHeight) {
        leftY = place(oversized, MARGIN, MARGIN);
      }
    }

    return placed;
  }

  private alternativeImage(alt: Alternative): string | null {
    const [segment] = alternativeSegments(alt).filter(
      (s) => s.kind === 'image',
    );
    return segment?.kind === 'image' ? segment.url : null;
  }

  private collectImageUrls(questions: Question[]): string[] {
    const urls: string[] = [];
    for (const question of questions) {
      for (const segment of contextSegments(question)) {
        if (segment.kind === 'image') urls.push(segment.url);
      }
      for (const alt of question.alternatives) {
        const url = this.alternativeImage(alt);
        if (url) urls.push(url);
      }
    }
    return urls;
  }

  private fitContextImage(
    image: LoadedImage,
    columnWidth: number,
    pageHeight: number,
  ): Size {
    const maxHeight = (pageHeight - MARGIN * 2) * CONTEXT_MAX_HEIGHT_RATIO;
    const scale = Math.min(
      columnWidth / image.width,
      maxHeight / image.height,
      1,
    );
    return { width: image.width * scale, height: image.height * scale };
  }

  private fitAlternativeImage(
    image: LoadedImage,
    availableWidth: number,
  ): Size {
    const scale = Math.min(
      ALTERNATIVE_TARGET_HEIGHT / image.height,
      availableWidth / image.width,
      ALTERNATIVE_MAX_UPSCALE,
    );
    return { width: image.width * scale, height: image.height * scale };
  }

  private measureQuestion(
    doc: PDFKit.PDFDocument,
    question: Question,
    columnWidth: number,
    pageHeight: number,
  ): number {
    let height = 20;

    doc.fontSize(10).font(FONT_REGULAR);

    for (const segment of contextSegments(question)) {
      height +=
        this.measureSegment(doc, segment, columnWidth, pageHeight) +
        SEGMENT_GAP;
    }

    const intro = cleanText(question.alternativesIntroduction);
    if (intro) {
      height +=
        doc.heightOfString(intro, { width: columnWidth, align: 'justify' }) +
        SEGMENT_GAP;
    }

    for (const alt of question.alternatives) {
      height += this.measureAlternative(doc, alt, columnWidth);
    }

    return height + 15;
  }

  private measureSegment(
    doc: PDFKit.PDFDocument,
    segment: ContentSegment,
    columnWidth: number,
    pageHeight: number,
  ): number {
    if (segment.kind === 'text') {
      return doc.heightOfString(segment.value, {
        width: columnWidth,
        align: 'justify',
      });
    }

    const image = this.images.get(segment.url);
    return image
      ? this.fitContextImage(image, columnWidth, pageHeight).height
      : 0;
  }

  private measureAlternative(
    doc: PDFKit.PDFDocument,
    alt: Alternative,
    columnWidth: number,
  ): number {
    const url = this.alternativeImage(alt);
    const image = url ? this.images.get(url) : null;

    if (image) {
      const letterWidth = doc.widthOfString(`${alt.letter}) `);
      const size = this.fitAlternativeImage(
        image,
        columnWidth - letterWidth - 5,
      );
      return Math.max(size.height, 14) + 8;
    }

    const text = cleanText(alt.text);
    if (!text) return 0;

    return (
      doc.heightOfString(`${alt.letter}) ${text}`, {
        width: columnWidth,
        align: 'justify',
      }) + 5
    );
  }

  private renderQuestion(
    doc: PDFKit.PDFDocument,
    question: Question,
    x: number,
    startY: number,
    columnWidth: number,
    pageHeight: number,
  ): number {
    let currentY = startY;

    doc
      .fontSize(12)
      .font(FONT_BOLD)
      .text(question.title, x, currentY, { width: columnWidth, align: 'left' });
    currentY += 20;

    doc.fontSize(10).font(FONT_REGULAR);

    for (const segment of contextSegments(question)) {
      currentY =
        this.renderSegment(doc, segment, x, currentY, columnWidth, pageHeight) +
        SEGMENT_GAP;
    }

    const intro = cleanText(question.alternativesIntroduction);
    if (intro) {
      doc.text(intro, x, currentY, { width: columnWidth, align: 'justify' });
      currentY = doc.y + SEGMENT_GAP;
    }

    for (const alt of question.alternatives) {
      currentY = this.renderAlternative(doc, alt, x, currentY, columnWidth);
    }

    return currentY;
  }

  private renderSegment(
    doc: PDFKit.PDFDocument,
    segment: ContentSegment,
    x: number,
    y: number,
    columnWidth: number,
    pageHeight: number,
  ): number {
    if (segment.kind === 'text') {
      doc.text(segment.value, x, y, { width: columnWidth, align: 'justify' });
      return doc.y;
    }

    const image = this.images.get(segment.url);
    if (!image) return y;

    const size = this.fitContextImage(image, columnWidth, pageHeight);
    doc.image(image.buffer, x, y, { width: size.width, height: size.height });
    return y + size.height;
  }

  private renderAlternative(
    doc: PDFKit.PDFDocument,
    alt: Alternative,
    x: number,
    y: number,
    columnWidth: number,
  ): number {
    const url = this.alternativeImage(alt);
    const image = url ? this.images.get(url) : null;

    if (image) {
      doc.text(`${alt.letter}) `, x, y, { lineBreak: false });
      const letterWidth = doc.widthOfString(`${alt.letter}) `);
      const size = this.fitAlternativeImage(
        image,
        columnWidth - letterWidth - 5,
      );
      doc.image(image.buffer, x + letterWidth, y, {
        width: size.width,
        height: size.height,
      });
      return y + Math.max(size.height, 14) + 8;
    }

    const text = cleanText(alt.text);
    if (!text) return y;

    doc.text(`${alt.letter}) ${text}`, x, y, {
      width: columnWidth,
      align: 'justify',
    });
    return doc.y + 5;
  }

  private renderAnswerKey(
    doc: PDFKit.PDFDocument,
    questions: Question[],
  ): void {
    const answered = questions
      .filter((q) => q.correctAlternative)
      .sort((a, b) => a.year - b.year || a.index - b.index);
    if (answered.length === 0) return;

    doc.addPage();
    doc.fontSize(16).font(FONT_BOLD).text('Gabarito', MARGIN, MARGIN);

    const multiYear = new Set(answered.map((q) => q.year)).size > 1;

    const columns = multiYear ? 4 : 5;
    const cellWidth = (doc.page.width - MARGIN * 2) / columns;
    let y = MARGIN + 32;

    doc.fontSize(11).font(FONT_REGULAR);

    answered.forEach((question, i) => {
      if (i > 0 && i % columns === 0) y += 20;

      if (y > doc.page.height - MARGIN) {
        doc.addPage();
        y = MARGIN;
      }

      const label = multiYear
        ? `${question.year} · ${question.index}. ${question.correctAlternative}`
        : `${question.index}. ${question.correctAlternative}`;

      doc.text(label, MARGIN + (i % columns) * cellWidth, y, {
        width: cellWidth,
      });
    });
  }
}
