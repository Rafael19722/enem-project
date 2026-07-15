import { Card, CardContent } from '@/components/ui/card';
import type { AnswerResult, ExamQuestion } from '@/lib/types';
import { questionKey } from '@/lib/types';

interface Props {
  questions: ExamQuestion[];
  results: Record<string, AnswerResult>;
}

const DISCIPLINE_LABELS: Record<string, string> = {
  linguagens: 'Linguagens',
  'ciencias-humanas': 'Ciências Humanas',
  'ciencias-natureza': 'Ciências da Natureza',
  matematica: 'Matemática',
};

function label(discipline: string | null): string {
  if (!discipline) return 'Outras';
  return DISCIPLINE_LABELS[discipline] ?? discipline;
}

export function ResultSummary({ questions, results }: Props) {
  const byDiscipline = new Map<string, { hits: number; total: number }>();

  for (const question of questions) {
    const result = results[questionKey(question)];
    if (!result) continue;

    const key = label(question.discipline);
    const row = byDiscipline.get(key) ?? { hits: 0, total: 0 };
    row.total++;
    if (result.correct) row.hits++;
    byDiscipline.set(key, row);
  }

  const total = [...byDiscipline.values()].reduce((n, r) => n + r.total, 0);
  const hits = [...byDiscipline.values()].reduce((n, r) => n + r.hits, 0);
  const pct = total > 0 ? Math.round((hits / total) * 100) : 0;

  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-bold text-primary">{pct}%</span>
          <span className="text-muted-foreground">
            {hits} de {total} {total === 1 ? 'questão' : 'questões'}
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {[...byDiscipline.entries()].map(([name, row]) => {
            const share = Math.round((row.hits / row.total) * 100);
            return (
              <div key={name}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{name}</span>
                  <span className="text-muted-foreground">
                    {row.hits}/{row.total} · {share}%
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label={`${name}: ${share}% de acerto`}
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${share}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* The first thing anyone will ask is what they would score on the real
            exam. The API ships no item difficulty, so a TRI estimate would be
            invented — and someone might pick a course over it. */}
        <p className="text-xs text-muted-foreground">
          Percentual de acerto simples. O ENEM usa TRI, que pesa cada questão
          pela dificuldade — este número não é, e não estima, uma nota TRI.
        </p>
      </CardContent>
    </Card>
  );
}
