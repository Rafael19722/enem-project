export interface Alternative {
  letter: string;
  text: string | null;
  file: string | null;
}

export interface Question {
  title: string;
  index: number;
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
