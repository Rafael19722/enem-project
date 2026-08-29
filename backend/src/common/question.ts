import { Prisma } from '@prisma/client';

export const questionInclude = {
  alternatives: { orderBy: { letter: 'asc' } },
  files: { orderBy: { position: 'asc' } },
} satisfies Prisma.QuestionInclude;

export type Question = Prisma.QuestionGetPayload<{
  include: typeof questionInclude;
}>;

export type Alternative = Question['alternatives'][number];

export interface Discipline {
  value: string;
  label: string;
}
