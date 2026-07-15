import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useDisciplines,
  useDrawQuestions,
  useGeneratePdf,
  useYears,
} from '@/hooks/useExams';
import type { Question } from '@/lib/types';

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

export function Home() {
  const [year, setYear] = useState<number | null>(null);
  const [discipline, setDiscipline] = useState('');
  const [amount, setAmount] = useState(5);
  const [questions, setQuestions] = useState<Question[] | null>(null);

  const years = useYears();
  const disciplines = useDisciplines(year);
  const draw = useDrawQuestions();
  const pdf = useGeneratePdf();

  const canDraw = year !== null && discipline !== '' && amount > 0;

  function handleDraw() {
    if (!canDraw || year === null) return;
    draw.mutate(
      { year, discipline, amount },
      { onSuccess: (data) => setQuestions(data) },
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">
        Monte seu simulado do ENEM
      </h1>
      <p className="mt-2 mb-8 leading-relaxed text-muted-foreground">
        Escolha o ano e a disciplina, defina quantas questões quer e gere um PDF
        com questões sorteadas aleatoriamente.
      </p>

      <Card>
        <CardContent className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_1fr_auto_auto]">
          <div className="grid gap-2">
            <Label htmlFor="year">Ano</Label>
            <Select
              value={year !== null ? year.toString() : null}
              disabled={years.isLoading || years.isError}
              onValueChange={(v) => {
                setYear(v ? Number(v) : null);
                setDiscipline('');
                setQuestions(null);
              }}
            >
              <SelectTrigger id="year" className="w-full">
                <SelectValue
                  placeholder={
                    years.isLoading
                      ? 'Carregando…'
                      : years.isError
                        ? 'Erro ao carregar'
                        : 'Selecione o ano'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {years.data?.map((y) => (
                  <SelectItem key={y} value={y.toString()}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="discipline">Disciplina</Label>
            <Select
              items={disciplines.data ?? []}
              value={discipline || null}
              disabled={year === null || disciplines.isLoading}
              onValueChange={(v) => {
                setDiscipline(v ?? '');
                setQuestions(null);
              }}
            >
              <SelectTrigger id="discipline" className="w-full">
                <SelectValue
                  placeholder={
                    year === null
                      ? 'Escolha o ano'
                      : disciplines.isLoading
                        ? 'Carregando…'
                        : 'Selecione a disciplina'
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
          </div>

          <div className="grid gap-2 sm:w-24">
            <Label htmlFor="amount">Qtd.</Label>
            <Input
              id="amount"
              type="number"
              min={1}
              max={45}
              value={amount}
              onChange={(e) =>
                setAmount(Math.max(1, Math.min(45, Number(e.target.value) || 1)))
              }
            />
          </div>

          <Button
            onClick={handleDraw}
            disabled={!canDraw || draw.isPending}
            className="max-sm:col-span-full"
          >
            {draw.isPending ? 'Sorteando…' : 'Sortear questões'}
          </Button>
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
              {questions.length} questões sorteadas
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
                key={q.index}
                className="flex items-start gap-3 rounded-lg border bg-card p-4"
              >
                <span className="shrink-0 pt-0.5 text-sm font-bold text-primary">
                  #{q.index}
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
