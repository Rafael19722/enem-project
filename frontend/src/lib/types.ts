export interface Alternative {
  letter: string;
  text: string | null;
  file: string | null;
}

export interface Question {
  title: string;
  index: number;
  year: number;
  discipline: string | null;
  language: string | null;
  context: string | null;
  alternativesIntroduction?: string | null;
  alternatives: Alternative[];
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

/** Identifies a drawn question for the PDF endpoint. */
export interface QuestionRef {
  year: number;
  index: number;
}
