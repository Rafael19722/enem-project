import {
  alternativeSegments,
  ContentSegment,
  contextSegments,
  parseSegments,
} from '../../common/question-content';
import { Question } from '../../common/question';

export interface ExamQuestion {
  year: number;
  index: number;
  title: string;
  discipline: string | null;
  language: string | null;
  context: ContentSegment[];
  alternativesIntroduction: ContentSegment[];
  alternatives: { letter: string; content: ContentSegment[] }[];
}

export function toExamQuestion(question: Question): ExamQuestion {
  return {
    year: question.year,
    index: question.index,
    title: question.title,
    discipline: question.discipline,
    language: question.language,
    context: contextSegments(question),
    alternativesIntroduction: parseSegments(question.alternativesIntroduction),
    alternatives: question.alternatives.map((alt) => ({
      letter: alt.letter,
      content: alternativeSegments(alt),
    })),
  };
}
