/**
 * Shape of a question as returned by api.enem.dev (v1).
 * Only the fields the app actually consumes are typed here.
 */
export interface Alternative {
  letter: string;
  text: string | null;
  file: string | null;
  isCorrect?: boolean;
}

export interface Question {
  title: string;
  index: number;
  discipline: string | null;
  language: string | null;
  context: string | null;
  files?: string[];
  correctAlternative?: string;
  alternativesIntroduction?: string | null;
  alternatives: Alternative[];
}

export interface Discipline {
  value: string;
  label: string;
}
