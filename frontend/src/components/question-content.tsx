import { cn } from '@/lib/utils';
import type { ContentSegment } from '@/lib/types';

/** Text segments carry the API's paragraph breaks as blank lines. */
function paragraphs(value: string): string[] {
  return value.split('\n\n').filter(Boolean);
}

/**
 * Renders a statement's segments in reading order.
 *
 * `max-width` on the images matters: the API serves figures up to 1248px wide
 * and they would otherwise blow out the layout on a phone. `loading="lazy"` is
 * why a 45 question simulado can sit on one page — the browser only fetches a
 * figure as it comes into view.
 */
export function QuestionContent({
  segments,
  className,
  /** Reading prose wants a measure; a one-line alternative does not. */
  prose = false,
}: {
  segments: ContentSegment[];
  className?: string;
  prose?: boolean;
}) {
  if (segments.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {segments.map((segment, i) =>
        segment.kind === 'text' ? (
          paragraphs(segment.value).map((paragraph, j) => (
            <p
              key={`${i}-${j}`}
              className={cn(
                // Justified needs hyphenation or it opens rivers of white
                // space. It works here because <html lang="pt-BR"> lets the
                // browser reach for a Portuguese dictionary.
                prose && 'max-w-[68ch] hyphens-auto text-justify',
              )}
            >
              {paragraph}
            </p>
          ))
        ) : (
          <img
            key={i}
            src={segment.url}
            // The API ships no description, and an invented one would be worse
            // than an honest generic label.
            alt="Figura da questão"
            loading="lazy"
            // The white plate is required, not decoration: 8 of 9 figures are
            // RGBA PNGs drawn in dark ink on transparency, so on the dark theme
            // they would render as good as invisible.
            className="max-w-full self-start rounded-md bg-white p-2"
          />
        ),
      )}
    </div>
  );
}
