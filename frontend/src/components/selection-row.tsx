import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDisciplines } from '@/hooks/useExams';

export interface SelectionRowValue {
  id: string;
  year: number | null;
  discipline: string;
  amount: number;
}

interface Props {
  value: SelectionRowValue;
  years: number[];
  yearsDisabled: boolean;
  canRemove: boolean;
  onChange: (next: SelectionRowValue) => void;
  onRemove: () => void;
}

/**
 * One line of the simulado: a year, a subject and how many questions to draw.
 * Disciplines are fetched per row because they are scoped to the exam year.
 */
export function SelectionRow({
  value,
  years,
  yearsDisabled,
  canRemove,
  onChange,
  onRemove,
}: Props) {
  const disciplines = useDisciplines(value.year);

  return (
    <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_1.6fr_auto_auto]">
      <Select
        value={value.year !== null ? value.year.toString() : null}
        disabled={yearsDisabled}
        onValueChange={(v) =>
          onChange({
            ...value,
            year: v ? Number(v) : null,
            // Disciplines are per-year, so a year change invalidates the pick.
            discipline: '',
          })
        }
      >
        <SelectTrigger className="w-full" aria-label="Ano">
          <SelectValue placeholder={yearsDisabled ? 'Carregando…' : 'Ano'} />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={y.toString()}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.discipline || null}
        disabled={value.year === null || disciplines.isLoading}
        onValueChange={(v) => onChange({ ...value, discipline: v ?? '' })}
      >
        <SelectTrigger className="w-full" aria-label="Matéria">
          <SelectValue
            placeholder={
              value.year === null
                ? 'Escolha o ano'
                : disciplines.isLoading
                  ? 'Carregando…'
                  : 'Matéria'
            }
          />
        </SelectTrigger>
        <SelectContent>
          {disciplines.data?.map((d) => (
            <SelectItem key={d.value} value={d.value}>
              {d.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="number"
        min={1}
        max={45}
        aria-label="Quantidade de questões"
        className="sm:w-20"
        value={value.amount}
        onChange={(e) =>
          onChange({
            ...value,
            amount: Math.max(1, Math.min(45, Number(e.target.value) || 1)),
          })
        }
      />

      <Button
        variant="ghost"
        aria-label="Remover matéria"
        disabled={!canRemove}
        onClick={onRemove}
      >
        Remover
      </Button>
    </div>
  );
}
