import { Injectable } from '@nestjs/common';
import { join } from 'path';
import PDFDocument from 'pdfkit';
import { Writable } from 'stream';
import { Alternative, Question } from '../common/question.interface';
import { ImageLoader, LoadedImage } from './image-loader';

const MARGIN = 40;
const QUESTION_GAP = 20;
const SEGMENT_GAP = 10;

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

/** A run of statement content: prose, or a figure sitting between prose. */
type Segment = { kind: 'text'; value: string } | { kind: 'image'; url: string };

/** Matches a markdown image or an <img> tag, capturing the source URL. */
const IMAGE_PATTERN = /!\[[^\]]*\]\(([^)]+)\)|<img[^>]+src="([^">]+)"[^>]*>/g;

/** A text run carrying no words — punctuation stranded by an image split. */
const PUNCTUATION_ONLY = /^[\s.,;:!?)\]]+$/;

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

    const placed = this.layout(doc, questions);
    this.renderAnswerKey(doc, placed);

    doc.end();

    await new Promise<void>((resolve, reject) => {
      output.on('finish', resolve);
      output.on('error', reject);
    });
  }

  // --- layout --------------------------------------------------------------

  /**
   * Places questions into two columns, returning them in the order they landed
   * on the page so the answer key can follow the same sequence.
   *
   * Strict document order wastes a lot of paper: one question taller than the
   * space left forces a new page and abandons whatever was still free, which
   * routinely left a full column blank. Instead each column takes the first
   * question still pending that actually fits it. Scanning pending in order
   * keeps the run of a subject together, since a later subject is only reached
   * once nothing from the current one fits.
   */
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
      // Try the roomier column first so the two stay roughly level.
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

      // A question taller than an empty column can never fit, so a fresh page
      // would not help; render it anyway and let it run past the bottom.
      const oversized = pending[0];
      if (heights.get(oversized)! > columnHeight) {
        leftY = place(oversized, MARGIN, MARGIN);
      }
    }

    return placed;
  }

  // --- content -------------------------------------------------------------

  /**
   * Splits a statement into prose and figures in reading order.
   *
   * The API embeds figures mid-sentence, and stripping them left the prose
   * dangling ("Considere 0,3 como aproximação para ." in 2023 question 152)
   * with every figure dumped below the text, out of order. Punctuation left
   * stranded by a split is folded back onto the preceding sentence.
   */
  private parseSegments(raw: string | null | undefined): Segment[] {
    if (!raw) return [];

    const segments: Segment[] = [];
    let cursor = 0;

    const pushText = (value: string) => {
      const text = this.cleanText(value);
      if (!text) return;

      // Look past the image that split it off to reach the sentence it ends.
      const lastText = segments.findLast((s) => s.kind === 'text');
      if (PUNCTUATION_ONLY.test(text) && lastText?.kind === 'text') {
        lastText.value += text;
        return;
      }
      segments.push({ kind: 'text', value: text });
    };

    IMAGE_PATTERN.lastIndex = 0;
    for (
      let match = IMAGE_PATTERN.exec(raw);
      match !== null;
      match = IMAGE_PATTERN.exec(raw)
    ) {
      pushText(raw.slice(cursor, match.index));
      const url = (match[1] ?? match[2])?.trim();
      if (url) segments.push({ kind: 'image', url });
      cursor = match.index + match[0].length;
    }
    pushText(raw.slice(cursor));

    return segments;
  }

  /**
   * The statement's segments, plus any image from `files` the prose never
   * referenced. `files` lists every figure of the question, so it backfills
   * whatever the inline markers missed.
   */
  private contextSegments(question: Question): Segment[] {
    const segments = this.parseSegments(question.context);
    const seen = new Set(
      segments.flatMap((s) => (s.kind === 'image' ? [s.url] : [])),
    );

    for (const file of question.files ?? []) {
      if (!seen.has(file)) segments.push({ kind: 'image', url: file });
    }

    return segments;
  }

  private alternativeImage(alt: Alternative): string | null {
    if (alt.file) return alt.file;
    const [segment] = this.parseSegments(alt.text).filter(
      (s) => s.kind === 'image',
    );
    return segment?.kind === 'image' ? segment.url : null;
  }

  private collectImageUrls(questions: Question[]): string[] {
    const urls: string[] = [];
    for (const question of questions) {
      for (const segment of this.contextSegments(question)) {
        if (segment.kind === 'image') urls.push(segment.url);
      }
      for (const alt of question.alternatives) {
        const url = this.alternativeImage(alt);
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

    for (const segment of this.contextSegments(question)) {
      height +=
        this.measureSegment(doc, segment, columnWidth, pageHeight) +
        SEGMENT_GAP;
    }

    const intro = this.cleanText(question.alternativesIntroduction);
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
    segment: Segment,
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

    for (const segment of this.contextSegments(question)) {
      currentY =
        this.renderSegment(doc, segment, x, currentY, columnWidth, pageHeight) +
        SEGMENT_GAP;
    }

    const intro = this.cleanText(question.alternativesIntroduction);
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
    segment: Segment,
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

    const text = this.cleanText(alt.text);
    if (!text) return y;

    doc.text(`${alt.letter}) ${text}`, x, y, {
      width: columnWidth,
      align: 'justify',
    });
    return doc.y + 5;
  }

  /**
   * Answer key on its own page, from the `correctAlternative` the API ships.
   *
   * Sorted by year and number rather than laid out in page order: this is a
   * lookup table, and someone marking their simulado is searching it for a
   * question number, not reading it top to bottom.
   */
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
}
