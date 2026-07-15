import type { ContentSegment } from '@/lib/types';

/**
 * Renders a statement's segments in reading order.
 *
 * `max-width` matters: the API serves figures up to 1248px wide and they would
 * otherwise blow out the layout on a phone. `loading="lazy"` is why a 45
 * question simulado can sit on one page — the browser only fetches a figure as
 * it comes into view.
 */
export function QuestionContent({
  segments,
  className,
}: {
  segments: ContentSegment[];
  className?: string;
}) {
  if (segments.length === 0) return null;

  return (
    <div className={className}>
      {segments.map((segment, i) =>
        segment.kind === 'text' ? (
          <p key={i} className="whitespace-pre-line not-first:mt-3">
            {segment.value}
          </p>
        ) : (
          <img
            key={i}
            src={segment.url}
            alt="Figura da questão"
            loading="lazy"
            className="mt-3 max-w-full rounded-md bg-white p-2"
          />
        ),
      )}
    </div>
  );
}
