import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { Discipline, Question } from '../common/question.interface';
import { DISCIPLINE_RANGES, isKnownDiscipline } from './discipline-ranges';

interface ExamSummary {
  year: number;
}

interface ExamDetails {
  disciplines: Discipline[];
  languages: Discipline[];
}

interface QuestionsResponse {
  questions: Question[];
}

/** One "draw this many of this subject from this year" request. */
export interface Selection {
  year: number;
  discipline: string;
  amount: number;
}

/** Identifies a question without shipping its content (or its answer) around. */
export interface QuestionRef {
  year: number;
  index: number;
}

@Injectable()
export class ExamsService {
  private readonly logger = new Logger(ExamsService.name);
  private readonly baseUrl: string;

  /**
   * Past exams are immutable, so a pool is fetched once per process. This also
   * makes the PDF's re-fetch of a drawn question essentially free.
   */
  private readonly pools = new Map<string, Promise<Question[]>>();

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.baseUrl = config.get<string>(
      'ENEM_API_URL',
      'https://api.enem.dev/v1',
    );
  }

  private async get<T>(path: string): Promise<T> {
    try {
      const { data } = await firstValueFrom(
        this.http.get<T>(`${this.baseUrl}${path}`),
      );
      return data;
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.error(
        `Upstream request failed: GET ${path} -> ${axiosError.message}`,
      );
      throw new ServiceUnavailableException(
        'Não foi possível consultar a API do ENEM no momento.',
      );
    }
  }

  /** Available exam years, newest first. */
  async getYears(): Promise<number[]> {
    const exams = await this.get<ExamSummary[]>('/exams');
    return exams.map((exam) => exam.year).sort((a, b) => b - a);
  }

  /** Disciplines + foreign languages available for a given year. */
  async getDisciplines(year: number): Promise<Discipline[]> {
    const details = await this.get<ExamDetails>(`/exams/${year}`);
    return [...details.disciplines, ...details.languages];
  }

  /**
   * Draws random questions for each selection and concatenates the results,
   * keeping the caller's selection order so the PDF groups by subject.
   */
  async drawQuestions(selections: Selection[]): Promise<Question[]> {
    for (const selection of selections) {
      if (!isKnownDiscipline(selection.discipline)) {
        throw new BadRequestException(
          `Disciplina desconhecida: "${selection.discipline}".`,
        );
      }
    }

    const drawn = await Promise.all(
      selections.map(async (selection) => {
        const pool = await this.getPool(selection.year, selection.discipline);
        return this.sample(pool, Math.min(selection.amount, pool.length));
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

  /**
   * Resolves refs back to full questions (answers included). Lets the PDF work
   * from server-side data instead of trusting whatever the client posts back.
   */
  async getQuestionsByRef(refs: QuestionRef[]): Promise<Question[]> {
    const years = [...new Set(refs.map((ref) => ref.year))];

    const byYear = new Map<number, Map<number, Question>>();
    await Promise.all(
      years.map(async (year) => {
        const questions = await this.getYearQuestions(year);
        byYear.set(year, new Map(questions.map((q) => [q.index, q])));
      }),
    );

    const resolved: Question[] = [];
    for (const ref of refs) {
      const question = byYear.get(ref.year)?.get(ref.index);
      if (!question) {
        throw new BadRequestException(
          `Questão ${ref.index} não encontrada no ENEM ${ref.year}.`,
        );
      }
      resolved.push(question);
    }
    return resolved;
  }

  private getPool(year: number, discipline: string): Promise<Question[]> {
    const key = `${year}:${discipline}`;
    const cached = this.pools.get(key);
    if (cached) return cached;

    // Cache the promise, not the result, so concurrent draws share one fetch.
    const pool = this.fetchDisciplinePool(year, discipline).catch((error) => {
      this.pools.delete(key);
      throw error;
    });
    this.pools.set(key, pool);
    return pool;
  }

  private async fetchDisciplinePool(
    year: number,
    discipline: string,
  ): Promise<Question[]> {
    const range = DISCIPLINE_RANGES[discipline];

    if (range.language) {
      const data = await this.get<QuestionsResponse>(
        `/exams/${year}/questions?language=${range.language}&limit=10`,
      );
      return data.questions.filter((q) => q.language === range.language);
    }

    const data = await this.get<QuestionsResponse>(
      `/exams/${year}/questions?offset=${range.offset}&limit=${range.limit}`,
    );
    return data.questions.filter((q) => q.discipline === discipline);
  }

  /** Every question of a year, assembled from the per-discipline pools. */
  private async getYearQuestions(year: number): Promise<Question[]> {
    const pools = await Promise.all(
      Object.keys(DISCIPLINE_RANGES).map((discipline) =>
        this.getPool(year, discipline),
      ),
    );
    return pools.flat();
  }

  /** Fisher-Yates partial shuffle: returns `count` distinct random items. */
  private sample<T>(items: T[], count: number): T[] {
    const copy = [...items];
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(Math.random() * (copy.length - i));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, count);
  }
}
