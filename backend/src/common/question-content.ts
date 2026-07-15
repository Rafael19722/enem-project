import { Alternative, Question } from './question.interface';

/**
 * Statement content, normalized once on the server and consumed by both the PDF
 * renderer and the web client. Keeping the parsing here is what stops the two
 * from drifting: every quirk below was found the hard way against real exams.
 */
export type ContentSegment =
  { kind: 'text'; value: string } | { kind: 'image'; url: string };

/** Matches a markdown image or an <img> tag, capturing the source URL. */
const IMAGE_PATTERN = /!\[[^\]]*\]\(([^)]+)\)|<img[^>]+src="([^">]+)"[^>]*>/g;

/** A text run carrying no words — punctuation stranded by an image split. */
const PUNCTUATION_ONLY = /^[\s.,;:!?)\]]+$/;

/** Strips HTML/markdown noise and normalizes whitespace. */
export function cleanText(text: string | null | undefined): string {
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

/**
 * Splits a statement into prose and figures in reading order.
 *
 * The API embeds figures mid-sentence, and stripping them left the prose
 * dangling ("Considere 0,3 como aproximação para ." in 2023 question 152) with
 * every figure dumped below the text, out of order. Punctuation left stranded
 * by a split is folded back onto the preceding sentence.
 */
export function parseSegments(
  raw: string | null | undefined,
): ContentSegment[] {
  if (!raw) return [];

  const segments: ContentSegment[] = [];
  let cursor = 0;

  const pushText = (value: string) => {
    const text = cleanText(value);
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
export function contextSegments(question: Question): ContentSegment[] {
  const segments = parseSegments(question.context);
  const seen = new Set(
    segments.flatMap((s) => (s.kind === 'image' ? [s.url] : [])),
  );

  for (const file of question.files ?? []) {
    if (!seen.has(file)) segments.push({ kind: 'image', url: file });
  }

  return segments;
}

/** An alternative is either a figure or a line of prose, never both. */
export function alternativeSegments(alt: Alternative): ContentSegment[] {
  if (alt.file) return [{ kind: 'image', url: alt.file }];
  return parseSegments(alt.text);
}
