import axios from 'axios';
import type { Discipline, Question } from './types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:5000',
});

export function getYears(): Promise<number[]> {
  return api.get<number[]>('/exams/years').then((r) => r.data);
}

export function getDisciplines(year: number): Promise<Discipline[]> {
  return api
    .get<Discipline[]>(`/exams/${year}/disciplines`)
    .then((r) => r.data);
}

export function getRandomQuestions(
  year: number,
  discipline: string,
  amount: number,
): Promise<Question[]> {
  return api
    .get<Question[]>(`/exams/${year}/questions`, {
      params: { discipline, amount },
    })
    .then((r) => r.data);
}

export function generatePdf(questions: Question[]): Promise<Blob> {
  return api
    .post('/pdf/questions', { questions }, { responseType: 'blob' })
    .then((r) => r.data);
}
