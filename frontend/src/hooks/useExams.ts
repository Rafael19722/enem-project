import { useMutation, useQuery } from '@tanstack/react-query';
import {
  generatePdf,
  getDisciplines,
  getRandomQuestions,
  getYears,
} from '../lib/api';
import type { Question } from '../lib/types';

export function useYears() {
  return useQuery({
    queryKey: ['years'],
    queryFn: getYears,
    staleTime: Infinity, // exam years never change within a session
  });
}

export function useDisciplines(year: number | null) {
  return useQuery({
    queryKey: ['disciplines', year],
    queryFn: () => getDisciplines(year as number),
    enabled: year !== null,
    staleTime: Infinity,
  });
}

export function useDrawQuestions() {
  return useMutation({
    mutationFn: (vars: { year: number; discipline: string; amount: number }) =>
      getRandomQuestions(vars.year, vars.discipline, vars.amount),
  });
}

export function useGeneratePdf() {
  return useMutation({
    mutationFn: (questions: Question[]) => generatePdf(questions),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'questoes-enem.pdf';
      link.click();
      URL.revokeObjectURL(url);
    },
  });
}
