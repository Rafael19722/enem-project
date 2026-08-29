import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Discipline, Question, questionInclude } from '../common/question';
import { PrismaService } from '../prisma/prisma.service';
import { DISCIPLINES } from './dto/draw-questions.dto';

export interface Selection {
  year: number;
  discipline: (typeof DISCIPLINES)[number];
  amount: number;
}

export interface QuestionRef {
  year: number;
  index: number;
}

export interface Answer extends QuestionRef {
  letter: string | null;
}

export interface AnswerResult extends QuestionRef {
  correct: boolean;
  correctAlternative: string;
}

@Injectable()
export class ExamsService {
  constructor(private readonly prisma: PrismaService) {}

  async getYears(): Promise<number[]> {
    const exams = await this.prisma.exam.findMany({
      select: { year: true },
      orderBy: { year: 'desc' },
    });
    return exams.map((exam) => exam.year);
  }

  async getDisciplines(year: number): Promise<Discipline[]> {
    const exam = await this.prisma.exam.findUnique({
      where: { year },
      select: { disciplines: true, languages: true },
    });

    if (!exam) {
      throw new NotFoundException(`O ENEM ${year} não está no banco.`);
    }

    return [
      ...(exam.disciplines as unknown as Discipline[]),
      ...(exam.languages as unknown as Discipline[]),
    ];
  }

  async drawQuestions(selections: Selection[]): Promise<Question[]> {
    const drawn = await Promise.all(
      selections.map(async (selection) => {
        const pool = await this.getPoolIds(
          selection.year,
          selection.discipline,
        );
        const ids = this.sample(pool, Math.min(selection.amount, pool.length));
        return this.getQuestionsById(ids);
      }),
    );

    const questions = drawn.flat();

    if (questions.length === 0) {
      throw new ServiceUnavailableException(
        'Nenhuma questão encontrada para essa seleção.',
      );
    }

    return questions;
  }

  async getQuestionsByRef(refs: QuestionRef[]): Promise<Question[]> {
    if (refs.length === 0) return [];

    const byYear = new Map<number, number[]>();
    for (const ref of refs) {
      const indexes = byYear.get(ref.year);
      if (indexes) indexes.push(ref.index);
      else byYear.set(ref.year, [ref.index]);
    }

    const rows = await this.prisma.question.findMany({
      where: {
        OR: [...byYear].map(([year, indexes]) => ({
          year,
          index: { in: indexes },
        })),
      },
      include: questionInclude,
      orderBy: [{ year: 'asc' }, { index: 'asc' }, { language: 'asc' }],
    });

    const byRef = new Map<string, Question>();
    for (const row of rows) {
      const key = `${row.year}:${row.index}`;
      if (!byRef.has(key)) byRef.set(key, row);
    }

    return refs.map((ref) => {
      const question = byRef.get(`${ref.year}:${ref.index}`);
      if (!question) {
        throw new BadRequestException(
          `Questão ${ref.index} não encontrada no ENEM ${ref.year}.`,
        );
      }
      return question;
    });
  }

  async checkAnswers(answers: Answer[]): Promise<AnswerResult[]> {
    const questions = await this.getQuestionsByRef(answers);

    return answers.map((answer, i) => {
      const correctAlternative = questions[i].correctAlternative ?? '';
      return {
        year: answer.year,
        index: answer.index,
        correct: answer.letter !== null && answer.letter === correctAlternative,
        correctAlternative,
      };
    });
  }

  private async getPoolIds(
    year: number,
    discipline: string,
  ): Promise<number[]> {
    const where: Prisma.QuestionWhereInput =
      discipline === 'ingles' || discipline === 'espanhol'
        ? { year, language: discipline }
        : { year, blockDiscipline: discipline, language: null };

    const rows = await this.prisma.question.findMany({
      where,
      select: { id: true },
      orderBy: { index: 'asc' },
    });

    return rows.map((row) => row.id);
  }

  private async getQuestionsById(ids: number[]): Promise<Question[]> {
    if (ids.length === 0) return [];

    const rows = await this.prisma.question.findMany({
      where: { id: { in: ids } },
      include: questionInclude,
    });

    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
      const question = byId.get(id);
      return question ? [question] : [];
    });
  }

  private sample<T>(items: T[], count: number): T[] {
    const copy = [...items];
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(Math.random() * (copy.length - i));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, count);
  }
}
