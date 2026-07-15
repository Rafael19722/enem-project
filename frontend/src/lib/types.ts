/** Statement content, already parsed by the server — see the backend's
 *  `question-content.ts`. The client never touches markdown. */
export type ContentSegment =
  | { kind: 'text'; value: string }
  | { kind: 'image'; url: string };

export interface ExamAlternative {
  letter: string;
  content: ContentSegment[];
}

export interface ExamQuestion {
  year: number;
  index: number;
  title: string;
  discipline: string | null;
  language: string | null;
  context: ContentSegment[];
  alternativesIntroduction: ContentSegment[];
  alternatives: ExamAlternative[];
}

export interface Discipline {
  value: string;
  label: string;
}

/** One "draw N questions of this subject from this year" request. */
export interface Selection {
  year: number;
  discipline: string;
  amount: number;
}

export interface QuestionRef {
  year: number;
  index: number;
}

export interface Answer extends QuestionRef {
  /** Null when left blank, which counts as wrong — same as the real exam. */
  letter: string | null;
}

export interface AnswerResult extends QuestionRef {
  correct: boolean;
  correctAlternative: string;
}

/**
 * Treino reveals each answer as it is given; prova holds everything back until
 * the simulado is finished. Everything else about the two is identical.
 */
export type Mode = 'treino' | 'prova';

export type Phase = 'respondendo' | 'resultado';

/** `${year}-${index}` — questions are only unique across years by the pair. */
export type QuestionKey = string;

export function questionKey(ref: QuestionRef): QuestionKey {
  return `${ref.year}-${ref.index}`;
}

/** A simulado in progress, as persisted to localStorage. */
export interface Session {
  mode: Mode;
  phase: Phase;
  questions: ExamQuestion[];
  answers: Record<QuestionKey, string>;
  results: Record<QuestionKey, AnswerResult>;
}
