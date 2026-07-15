import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { Mode } from '@/lib/types';

const OPTIONS: { value: Mode; title: string; hint: string }[] = [
  { value: 'treino', title: 'Treino', hint: 'Vê o resultado a cada questão' },
  { value: 'prova', title: 'Prova', hint: 'Só corrige no final' },
];

/** A property of the simulado being built, not a global preference. */
export function ModePicker({
  value,
  onChange,
}: {
  value: Mode;
  onChange: (mode: Mode) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label>Modo</Label>
      <div className="flex gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex-1 rounded-md border p-3 text-left transition-colors',
              value === option.value
                ? 'border-primary bg-primary/10'
                : 'hover:bg-accent',
            )}
          >
            <span className="block text-sm font-medium">{option.title}</span>
            <span className="block text-xs text-muted-foreground">
              {option.hint}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
