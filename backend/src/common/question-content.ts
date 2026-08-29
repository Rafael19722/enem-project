import { Alternative, Question } from './question';

export type ContentSegment =
  { kind: 'text'; value: string } | { kind: 'image'; url: string };

const IMAGE_PATTERN = /!\[[^\]]*\]\(([^)]+)\)|<img[^>]+src="([^">]+)"[^>]*>/g;

const PUNCTUATION_ONLY = /^[\s.,;:!?)\]]+$/;

export function cleanText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')

    .replace(/_(.+?)_/g, '$1')

    .replace(/\\n/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n+/g, '\n\n')
    .trim();
}

export function paragraphs(value: string): string[] {
  return value.split('\n\n').filter((p) => p.length > 0);
}

export function parseSegments(
  raw: string | null | undefined,
): ContentSegment[] {
  if (!raw) return [];

  const segments: ContentSegment[] = [];
  let cursor = 0;

  const pushText = (value: string) => {
    const text = cleanText(value);
    if (!text) return;

    const paras = paragraphs(text);

    if (paras.length > 0 && PUNCTUATION_ONLY.test(paras[0])) {
      const lastText = segments.findLast((s) => s.kind === 'text');
      if (lastText?.kind === 'text') {
        lastText.value += paras.shift();
      }
    }

    if (paras.length === 0) return;
    segments.push({ kind: 'text', value: paras.join('\n\n') });
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

export function contextSegments(question: Question): ContentSegment[] {
  const segments = parseSegments(question.context);
  const seen = new Set(
    segments.flatMap((s) => (s.kind === 'image' ? [s.url] : [])),
  );

  for (const { url } of question.files) {
    if (!seen.has(url)) segments.push({ kind: 'image', url });
  }

  return segments;
}

export function alternativeSegments(alt: Alternative): ContentSegment[] {
  if (alt.file) return [{ kind: 'image', url: alt.file }];
  return parseSegments(alt.text);
}
