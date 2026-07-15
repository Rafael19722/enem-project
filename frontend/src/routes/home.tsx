import { useState } from 'react';
import {
  SelectionRow,
  type SelectionRowValue,
} from '@/components/selection-row';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useDrawQuestions, useGeneratePdf, useYears } from '@/hooks/useExams';
import type { Question, Selection } from '@/lib/types';

function snippet(text: string | null, max = 160): string {
  if (!text) return '';
  const clean = text
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[*#>_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function newRow(year: number | null = null): SelectionRowValue {
  return { id: crypto.randomUUID(), year, discipline: '', amount: 5 };
}

export function Home() {
  const [rows, setRows] = useState<SelectionRowValue[]>([newRow()]);
  const [questions, setQuestions] = useState<Question[] | null>(null);

  const years = useYears();
  const draw = useDrawQuestions();
  const pdf = useGeneratePdf();

  const selections: Selection[] = rows
    .filter((r) => r.year !== null && r.discipline !== '')
    .map((r) => ({
      year: r.year as number,
      discipline: r.discipline,
      amount: r.amount,
    }));

  const total = selections.reduce((sum, s) => sum + s.amount, 0);
  const canDraw = selections.length > 0 && !draw.isPending;

  function updateRow(next: SelectionRowValue) {
    setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)));
    setQuestions(null);
  }

  function addRow() {
    // Reuse the last year picked — most people build a simulado from one exam.
    setRows((prev) => [...prev, newRow(prev.at(-1)?.year ?? null)]);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setQuestions(null);
  }

  function handleDraw() {
    if (selections.length === 0) return;
    draw.mutate(selections, { onSuccess: setQuestions });
  }

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">
        Monte seu simulado do ENEM
      </h1>
      <p className="mt-2 mb-8 leading-relaxed text-muted-foreground">
        Escolha as matérias e os anos, defina quantas questões quer de cada uma e
        gere um PDF com questões sorteadas aleatoriamente e gabarito no final.
      </p>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.6fr_auto_auto]">
            <Label className="max-sm:hidden">Ano</Label>
            <Label className="max-sm:hidden">Matéria</Label>
            <Label className="max-sm:hidden sm:w-20">Qtd.</Label>
            <span />
          </div>

          {rows.map((row) => (
            <SelectionRow
              key={row.id}
              value={row}
              years={years.data ?? []}
              yearsDisabled={years.isLoading || years.isError}
              canRemove={rows.length > 1}
              onChange={updateRow}
              onRemove={() => removeRow(row.id)}
            />
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <Button variant="outline" onClick={addRow}>
              + Adicionar matéria
            </Button>

            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {total > 0
                  ? `${total} ${total === 1 ? 'questão' : 'questões'}`
                  : 'Nenhuma matéria selecionada'}
              </span>
              <Button onClick={handleDraw} disabled={!canDraw}>
                {draw.isPending ? 'Sorteando…' : 'Sortear simulado'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {years.isError && (
        <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Não foi possível conectar ao servidor. Se o backend estiver no plano
          gratuito do Render, ele pode levar ~30s para acordar — tente de novo em
          instantes.
        </p>
      )}

      {draw.isError && (
        <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Não foi possível sortear as questões. Tente novamente.
        </p>
      )}

      {questions && (
        <section className="mt-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">
              {questions.length}{' '}
              {questions.length === 1 ? 'questão sorteada' : 'questões sorteadas'}
            </h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleDraw}
                disabled={draw.isPending}
              >
                Sortear de novo
              </Button>
              <Button
                onClick={() => pdf.mutate(questions)}
                disabled={pdf.isPending}
              >
                {pdf.isPending ? 'Gerando PDF…' : 'Baixar PDF'}
              </Button>
            </div>
          </div>

          {pdf.isError && (
            <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Falha ao gerar o PDF. Tente novamente.
            </p>
          )}

          <ol className="flex flex-col gap-3">
            {questions.map((q) => (
              <li
                key={`${q.year}-${q.index}`}
                className="flex items-start gap-3 rounded-lg border bg-card p-4"
              >
                <span className="shrink-0 pt-0.5 text-sm font-bold text-primary">
                  #{q.index}
                </span>
                <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">
                  {q.year}
                </span>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {snippet(q.context) ||
                    snippet(q.alternativesIntroduction ?? null) ||
                    q.title}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
