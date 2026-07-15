/**
 * The ENEM exam always ships 180 questions laid out in fixed, contiguous
 * position ranges per discipline. We fetch only the slice a discipline occupies
 * (offset/limit against api.enem.dev) instead of pulling all 180 questions.
 *
 * These numbers mirror the physical structure of the exam booklet, so they are
 * inherently fragile: if the ENEM ever changes its layout, this map must change.
 *
 * `linguagens` shares 45 slots with the foreign-language block: questions 1-5
 * are language-specific (English/Spanish) and 6-45 are the shared portion.
 */
export interface DisciplineRange {
  offset: number;
  limit: number;
  /** Present only for the foreign-language blocks (fetched via ?language=). */
  language?: 'ingles' | 'espanhol';
}

export const DISCIPLINE_RANGES: Record<string, DisciplineRange> = {
  linguagens: { offset: 6, limit: 39 },
  'ciencias-humanas': { offset: 46, limit: 44 },
  'ciencias-natureza': { offset: 91, limit: 44 },
  matematica: { offset: 136, limit: 44 },
  ingles: { offset: 1, limit: 5, language: 'ingles' },
  espanhol: { offset: 1, limit: 5, language: 'espanhol' },
};

export function isKnownDiscipline(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(DISCIPLINE_RANGES, value);
}
