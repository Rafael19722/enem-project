import { useMutation, useQuery } from '@tanstack/react-query';
import {
  drawQuestions,
  generatePdf,
  getDisciplines,
  getYears,
} from '../lib/api';
import type { Question, Selection } from '../lib/types';

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
    mutationFn: (selections: Selection[]) => drawQuestions(selections),
  });
}

export function useGeneratePdf() {
  return useMutation({
    mutationFn: (questions: Question[]) =>
      generatePdf(questions.map((q) => ({ year: q.year, index: q.index }))),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'simulado-enem.pdf';
      link.click();
      URL.revokeObjectURL(url);
    },
  });
}
