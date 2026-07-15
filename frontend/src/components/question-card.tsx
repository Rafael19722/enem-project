import { QuestionContent } from '@/components/question-content';
import { cn } from '@/lib/utils';
import type { AnswerResult, ExamQuestion } from '@/lib/types';

interface Props {
  question: ExamQuestion;
  position: number;
  selected: string | null;
  result?: AnswerResult;
  onSelect: (letter: string) => void;
}

export function QuestionCard({
  question,
  position,
  selected,
  result,
  onSelect,
}: Props) {
  const revealed = result !== undefined;

  return (
    <article className="rounded-lg border bg-card p-5">
      <header className="mb-3 flex items-baseline gap-3">
        <span className="text-sm font-bold text-primary">{position}</span>
        <h3 className="text-sm font-semibold">{question.title}</h3>
        {revealed && (
          <span
            className={cn(
              'ml-auto text-xs font-medium',
              result.correct ? 'text-primary' : 'text-destructive',
            )}
          >
            {result.correct ? 'Acertou' : 'Errou'}
          </span>
        )}
      </header>

      <QuestionContent
        segments={question.context}
        className="text-sm leading-relaxed"
      />
      <QuestionContent
        segments={question.alternativesIntroduction}
        className="mt-3 text-sm leading-relaxed font-medium"
      />

      <ul className="mt-4 flex flex-col gap-2">
        {question.alternatives.map((alt) => {
          const isSelected = selected === alt.letter;
          const isCorrect = revealed && result.correctAlternative === alt.letter;
          const isWrongPick = revealed && isSelected && !result.correct;

          return (
            <li key={alt.letter}>
              <button
                type="button"
                // Revealing freezes the question: changing an answer you have
                // already been told is right teaches nothing.
                disabled={revealed}
                aria-pressed={isSelected}
                onClick={() => onSelect(alt.letter)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-md border p-3 text-left text-sm transition-colors',
                  'disabled:cursor-default',
                  !revealed && 'hover:bg-accent',
                  isSelected && !revealed && 'border-primary bg-primary/10',
                  isCorrect && 'border-primary bg-primary/10',
                  isWrongPick && 'border-destructive bg-destructive/10',
                )}
              >
                <span
                  className={cn(
                    'font-bold',
                    isCorrect && 'text-primary',
                    isWrongPick && 'text-destructive',
                  )}
                >
                  {alt.letter}
                </span>
                <QuestionContent segments={alt.content} className="min-w-0" />
              </button>
            </li>
          );
        })}
      </ul>

      {revealed && !result.correct && (
        <p className="mt-3 text-xs text-muted-foreground">
          Resposta correta: <strong>{result.correctAlternative}</strong>
        </p>
      )}
    </article>
  );
}
