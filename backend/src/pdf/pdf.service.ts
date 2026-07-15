import { Injectable } from '@nestjs/common';
import { join } from 'path';
import PDFDocument from 'pdfkit';
import { Writable } from 'stream';
import { Question } from '../common/question.interface';
import { ImageLoader, LoadedImage } from './image-loader';

const MARGIN = 40;
const QUESTION_GAP = 20;

/**
 * pdfkit's built-in Helvetica is limited to WinAnsi, which silently mangles
 * every character outside Latin-1 — π, −, ≠, ∈ and µ all appear in the exams,
 * and the API's OCR renders "TEXTO" headers with Cyrillic homoglyphs. That hit
 * 12 of the 180 questions in ENEM 2023 alone. DejaVu covers all of it, and is
 * bundled (rather than taken from the OS) so deploys don't depend on system
 * fonts being installed.
 */
const FONTS_DIR = join(__dirname, 'fonts');
const FONT_REGULAR = 'body';
const FONT_BOLD = 'body-bold';

/**
 * api.enem.dev crops its images out of scanned booklets without normalizing
 * them: context images run 93-1248px wide and alternative images 35-355px, so
 * pixel size says nothing about intended size and each role needs its own rule.
 *
 * Context images are mixed — big figures *and* small inline formulas — so they
 * are only ever scaled down: a wide figure shrinks to the column, a small
 * formula keeps its native size. Enlarging them just produces blur (a 93px
 * formula stretched to the column is visibly mush). The old code got this right
 * with its scale cap of 1; what broke context images was the 60pt height cap,
 * which squashed every figure regardless of shape.
 *
 * Alternative images are uniform in role — they're formulas sitting next to a
 * letter — so they normalize on height instead, which lines the row up. Here
 * the cap of 1 was the bug: it left 35px formulas at a 12mm-wide speck.
 */
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

  /**
   * Renders the questions into a two-column PDF followed by an answer key, and
   * pipes it to `output`. Resolves once the document is finalized.
   */
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

    const pageHeight = doc.page.height;
    const columnWidth = (doc.page.width - MARGIN * 3) / 2;
    const rightColumnX = MARGIN + columnWidth + MARGIN;

    let leftY = MARGIN;
    let rightY = MARGIN;

    for (const question of questions) {
      const height = this.measureQuestion(
        doc,
        question,
        columnWidth,
        pageHeight,
      );

      const leftSpace = pageHeight - MARGIN - leftY;
      const rightSpace = pageHeight - MARGIN - rightY;
      let useLeftColumn = leftSpace >= rightSpace;

      let x = useLeftColumn ? MARGIN : rightColumnX;
      let currentY = useLeftColumn ? leftY : rightY;

      // Doesn't fit in the roomier column? Try the other one, then a new page.
      if (currentY + height > pageHeight - MARGIN) {
        useLeftColumn = !useLeftColumn;
        x = useLeftColumn ? MARGIN : rightColumnX;
        currentY = useLeftColumn ? leftY : rightY;

        if (currentY + height > pageHeight - MARGIN) {
          doc.addPage();
          leftY = MARGIN;
          rightY = MARGIN;
          useLeftColumn = true;
          x = MARGIN;
          currentY = MARGIN;
        }
      }

      const finalY = this.renderQuestion(
        doc,
        question,
        x,
        currentY,
        columnWidth,
        pageHeight,
      );

      if (useLeftColumn) {
        leftY = finalY + QUESTION_GAP;
      } else {
        rightY = finalY + QUESTION_GAP;
      }
    }

    this.renderAnswerKey(doc, questions);

    doc.end();

    await new Promise<void>((resolve, reject) => {
      output.on('finish', resolve);
      output.on('error', reject);
    });
  }

  // --- image selection -----------------------------------------------------

  /**
   * Context figures come from `files`, which the API populates with every image
   * in the statement. The old regex over the markdown returned only the first
   * match, silently dropping the rest (2023 question 152 ships four).
   */
  private contextImages(question: Question): string[] {
    if (question.files?.length) return question.files;
    const inline = this.extractImageUrl(question.context);
    return inline ? [inline] : [];
  }

  private alternativeImage(
    text: string | null,
    file: string | null,
  ): string | null {
    return file ?? this.extractImageUrl(text);
  }

  private collectImageUrls(questions: Question[]): string[] {
    const urls: string[] = [];
    for (const question of questions) {
      urls.push(...this.contextImages(question));
      for (const alt of question.alternatives) {
        const url = this.alternativeImage(alt.text, alt.file);
        if (url) urls.push(url);
      }
    }
    return urls;
  }

  // --- sizing --------------------------------------------------------------

  /** Shrink-to-fit only: fills the column when wide, stays native when small. */
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

  /** Formulas share a common height so a row of alternatives lines up. */
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

  // --- measurement ---------------------------------------------------------

  /**
   * Height the question will occupy. Every image is already loaded, so this
   * agrees with what `renderQuestion` draws — the column breaking depends on it.
   */
  private measureQuestion(
    doc: PDFKit.PDFDocument,
    question: Question,
    columnWidth: number,
    pageHeight: number,
  ): number {
    let height = 20; // title

    doc.fontSize(10).font(FONT_REGULAR);

    const context = this.cleanText(question.context);
    if (context) {
      height +=
        doc.heightOfString(context, { width: columnWidth, align: 'justify' }) +
        10;
    }

    for (const url of this.contextImages(question)) {
      const image = this.images.get(url);
      if (!image) continue;
      height +=
        this.fitContextImage(image, columnWidth, pageHeight).height + 10;
    }

    const intro = this.cleanText(question.alternativesIntroduction);
    if (intro) {
      height +=
        doc.heightOfString(intro, { width: columnWidth, align: 'justify' }) +
        10;
    }

    for (const alt of question.alternatives) {
      height += this.measureAlternative(doc, alt, columnWidth);
    }

    return height + 15;
  }

  private measureAlternative(
    doc: PDFKit.PDFDocument,
    alt: Question['alternatives'][number],
    columnWidth: number,
  ): number {
    const url = this.alternativeImage(alt.text, alt.file);
    const image = url ? this.images.get(url) : null;

    if (image) {
      const letterWidth = doc.widthOfString(`${alt.letter}) `);
      const size = this.fitAlternativeImage(
        image,
        columnWidth - letterWidth - 5,
      );
      return Math.max(size.height, 14) + 8;
    }

    const text = this.cleanText(alt.text);
    if (!text) return 0;

    return (
      doc.heightOfString(`${alt.letter}) ${text}`, {
        width: columnWidth,
        align: 'justify',
      }) + 5
    );
  }

  // --- rendering -----------------------------------------------------------

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

    const context = this.cleanText(question.context);
    if (context) {
      doc.text(context, x, currentY, { width: columnWidth, align: 'justify' });
      currentY = doc.y + 10;
    }

    for (const url of this.contextImages(question)) {
      const image = this.images.get(url);
      if (!image) continue;
      const size = this.fitContextImage(image, columnWidth, pageHeight);
      doc.image(image.buffer, x, currentY, {
        width: size.width,
        height: size.height,
      });
      currentY += size.height + 10;
    }

    const intro = this.cleanText(question.alternativesIntroduction);
    if (intro) {
      doc.text(intro, x, currentY, { width: columnWidth, align: 'justify' });
      currentY = doc.y + 10;
    }

    for (const alt of question.alternatives) {
      currentY = this.renderAlternative(doc, alt, x, currentY, columnWidth);
    }

    return currentY;
  }

  private renderAlternative(
    doc: PDFKit.PDFDocument,
    alt: Question['alternatives'][number],
    x: number,
    y: number,
    columnWidth: number,
  ): number {
    const url = this.alternativeImage(alt.text, alt.file);
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

    const text = this.cleanText(alt.text);
    if (!text) return y;

    doc.text(`${alt.letter}) ${text}`, x, y, {
      width: columnWidth,
      align: 'justify',
    });
    return doc.y + 5;
  }

  /** Answer key on its own page, from the `correctAlternative` the API ships. */
  private renderAnswerKey(
    doc: PDFKit.PDFDocument,
    questions: Question[],
  ): void {
    const answered = questions.filter((q) => q.correctAlternative);
    if (answered.length === 0) return;

    doc.addPage();
    doc.fontSize(16).font(FONT_BOLD).text('Gabarito', MARGIN, MARGIN);

    // A question number only identifies a question within its own exam, so a
    // simulado mixing years has to say which year each answer belongs to.
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

  // --- text ----------------------------------------------------------------

  /** Strips HTML/markdown noise and normalizes whitespace. */
  private cleanText(text: string | null | undefined): string {
    if (!text) return '';
    return (
      text
        .replace(/!\[.*?\]\(.*?\)/g, '')
        .replace(/<img[^>]*>/g, '')
        .replace(/<[^>]*>/g, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        // The API marks variables as _N_ / _I_; without this they read literally.
        .replace(/_(.+?)_/g, '$1')
        .replace(/\s+/g, ' ')
        .replace(/\\n/g, '\n')
        .trim()
    );
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
}
