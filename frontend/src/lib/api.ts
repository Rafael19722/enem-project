import axios from 'axios';
import type {
  Answer,
  AnswerResult,
  Discipline,
  ExamQuestion,
  QuestionRef,
  Selection,
} from './types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:5000',
});

export function getYears(): Promise<number[]> {
  return api.get<number[]>('/exams/years').then((r) => r.data);
}

export function getDisciplines(year: number): Promise<Discipline[]> {
  return api.get<Discipline[]>(`/exams/${year}/disciplines`).then((r) => r.data);
}

export function drawQuestions(selections: Selection[]): Promise<ExamQuestion[]> {
  return api
    .post<ExamQuestion[]>('/exams/draw', { selections })
    .then((r) => r.data);
}

/** The key lives on the server; grading is the only way to learn an answer. */
export function checkAnswers(answers: Answer[]): Promise<AnswerResult[]> {
  return api
    .post<AnswerResult[]>('/exams/check', { answers })
    .then((r) => r.data);
}

/** The server rebuilds the questions from these refs, answer key included. */
export function generatePdf(refs: QuestionRef[]): Promise<Blob> {
  return api
    .post('/pdf/questions', { refs }, { responseType: 'blob' })
    .then((r) => r.data);
}
