import { cn } from '@/lib/utils';

/**
 * Brand mark: an open book with a check on the right page, next to the
 * stacked "enem simples" wordmark. Both halves ride on --primary, so the
 * logo follows the theme instead of shipping two raster files.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-2.5', className)}
      aria-label="enem simples"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="size-9 shrink-0 text-primary"
      >
        <path d="M3 4h18v13q-5 1-9 3-4-2-9-3Z" />
        <path d="M12 4v16" />
        <path d="m14.75 12 2 2 3.5-4.5" />
      </svg>

      <span className="flex flex-col gap-0.5 leading-none">
        <span className="text-xl font-bold text-primary">enem</span>
        <span className="text-[0.8125rem] font-light tracking-[0.18em] text-foreground">
          simples
        </span>
      </span>
    </span>
  );
}
