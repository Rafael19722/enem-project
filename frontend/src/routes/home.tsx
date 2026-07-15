import { useState } from 'react';
import { ModePicker } from '@/components/mode-picker';
import { QuestionCard } from '@/components/question-card';
import { ResultSummary } from '@/components/result-summary';
import {
  SelectionRow,
  type SelectionRowValue,
} from '@/components/selection-row';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  useCheckAnswers,
  useDrawQuestions,
  useGeneratePdf,
  useYears,
} from '@/hooks/useExams';
import { useSession } from '@/hooks/useSession';
import type { AnswerResult, Mode, Selection } from '@/lib/types';
import { questionKey } from '@/lib/types';

function newRow(year: number | null = null): SelectionRowValue {
  return { id: crypto.randomUUID(), year, discipline: '', amount: 5 };
}

function indexResults(results: AnswerResult[]): Record<string, AnswerResult> {
  return Object.fromEntries(results.map((r) => [questionKey(r), r]));
}

export function Home() {
  const [rows, setRows] = useState<SelectionRowValue[]>([newRow()]);
  const [mode, setMode] = useState<Mode>('treino');

  const years = useYears();
  const draw = useDrawQuestions();
  const check = useCheckAnswers();
  const pdf = useGeneratePdf();
  const { session, setSession, update } = useSession();

  const selections: Selection[] = rows
    .filter((r) => r.year !== null && r.discipline !== '')
    .map((r) => ({
      year: r.year as number,
      discipline: r.discipline,
      amount: r.amount,
    }));

  const total = selections.reduce((sum, s) => sum + s.amount, 0);

  function handleDraw() {
    if (selections.length === 0) return;
    draw.mutate(selections, {
      onSuccess: (questions) =>
        setSession({
          mode,
          phase: 'respondendo',
          questions,
          answers: {},
          results: {},
        }),
    });
  }

  /** In treino the answer is graded the moment it is given; in prova it is
   *  only recorded, and everything is graded on finish. */
  function handleSelect(key: string, letter: string) {
    if (!session) return;

    update((current) => ({ answers: { ...current.answers, [key]: letter } }));

    if (session.mode !== 'treino') return;

    const [year, index] = key.split('-').map(Number);
    check.mutate([{ year, index, letter }], {
      onSuccess: (results) =>
        update((current) => ({
          results: { ...current.results, ...indexResults(results) },
        })),
    });
  }

  function handleFinish() {
    if (!session) return;

    const answers = session.questions.map((q) => ({
      year: q.year,
      index: q.index,
      letter: session.answers[questionKey(q)] ?? null,
    }));

    check.mutate(answers, {
      onSuccess: (results) => {
        update({ phase: 'resultado', results: indexResults(results) });
        // Finishing renders the score at the top of the page, and the click
        // that triggered it happened at the very bottom.
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    });
  }

  function handleRestart() {
    const answered = Object.keys(session?.answers ?? {}).length;
    const inProgress = session?.phase === 'respondendo' && answered > 0;

    // Losing answered questions to a stray click is exactly what the saved
    // session exists to prevent.
    if (
      inProgress &&
      !confirm(
        `Você tem ${answered} ${answered === 1 ? 'questão respondida' : 'questões respondidas'}. Começar um novo simulado descarta esse progresso.`,
      )
    ) {
      return;
    }
    setSession(null);
  }

  if (session) {
    const answeredCount = Object.keys(session.answers).length;
    const done = session.phase === 'resultado';

    return (
      <div>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {done ? 'Resultado' : 'Seu simulado'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {session.questions.length}{' '}
              {session.questions.length === 1 ? 'questão' : 'questões'} ·{' '}
              {session.mode === 'treino' ? 'treino' : 'prova'}
              {!done && ` · ${answeredCount} respondida${answeredCount === 1 ? '' : 's'}`}
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => pdf.mutate(session.questions)}
              disabled={pdf.isPending}
            >
              {pdf.isPending ? 'Gerando…' : 'Baixar PDF'}
            </Button>
            <Button variant="ghost" onClick={handleRestart}>
              Novo simulado
            </Button>
          </div>
        </div>

        {done && (
          <div className="mb-8">
            <ResultSummary
              questions={session.questions}
              results={session.results}
            />
          </div>
        )}

        {check.isError && (
          <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Não foi possível corrigir agora. Suas respostas estão salvas — tente
            de novo.
          </p>
        )}

        <div className="flex flex-col gap-5">
          {session.questions.map((question, i) => {
            const key = questionKey(question);
            return (
              <QuestionCard
                key={key}
                question={question}
                position={i + 1}
                selected={session.answers[key] ?? null}
                result={session.results[key]}
                onSelect={(letter) => handleSelect(key, letter)}
              />
            );
          })}
        </div>

        {!done && (
          <div className="mt-8 flex justify-center">
            <Button
              size="lg"
              onClick={handleFinish}
              disabled={check.isPending || answeredCount === 0}
            >
              {check.isPending ? 'Corrigindo…' : 'Finalizar e ver resultado'}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">
        Monte seu simulado do ENEM
      </h1>
      <p className="mt-2 mb-8 leading-relaxed text-muted-foreground">
        Escolha as matérias e os anos, defina quantas questões quer de cada uma e
        responda aqui mesmo — ou baixe em PDF pra imprimir. Sem cadastro.
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
              onChange={(next) =>
                setRows((prev) =>
                  prev.map((r) => (r.id === next.id ? next : r)),
                )
              }
              onRemove={() =>
                setRows((prev) => prev.filter((r) => r.id !== row.id))
              }
            />
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <Button
              variant="outline"
              onClick={() =>
                setRows((prev) => [...prev, newRow(prev.at(-1)?.year ?? null)])
              }
            >
              + Adicionar matéria
            </Button>
            <span className="text-sm text-muted-foreground">
              {total > 0
                ? `${total} ${total === 1 ? 'questão' : 'questões'}`
                : 'Nenhuma matéria selecionada'}
            </span>
          </div>

          <div className="border-t pt-4">
            <ModePicker value={mode} onChange={setMode} />
          </div>

          <Button
            size="lg"
            onClick={handleDraw}
            disabled={selections.length === 0 || draw.isPending}
          >
            {draw.isPending ? 'Sorteando…' : 'Começar simulado'}
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
    </div>
  );
}
