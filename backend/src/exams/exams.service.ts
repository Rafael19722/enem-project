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
import {
  DisciplineBlock,
  deriveDisciplineBlocks,
  isKnownDiscipline,
  ManifestEntry,
} from './discipline-blocks';

/** Largest page the upstream API accepts. */
const MAX_LIMIT = 50;

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 400;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface ExamSummary {
  year: number;
}

interface ExamDetails {
  disciplines: Discipline[];
  languages: Discipline[];
  questions: ManifestEntry[];
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

export interface Answer extends QuestionRef {
  /** Null when left blank, which counts as wrong — same as the real exam. */
  letter: string | null;
}

export interface AnswerResult extends QuestionRef {
  correct: boolean;
  correctAlternative: string;
}

interface ExamData {
  blocks: Map<string, DisciplineBlock>;
  /** Every question of the year, keyed by index. */
  questions: Map<number, Question>;
}

@Injectable()
export class ExamsService {
  private readonly logger = new Logger(ExamsService.name);
  private readonly baseUrl: string;

  /**
   * Past exams are immutable, so each year is fetched once per process. Caching
   * the promise (not the result) means concurrent draws share a single fetch.
   */
  private readonly exams = new Map<number, Promise<ExamData>>();
  private readonly languagePools = new Map<string, Promise<Question[]>>();

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.baseUrl = config.get<string>(
      'ENEM_API_URL',
      'https://api.enem.dev/v1',
    );
  }

  /**
   * Fetches a path, retrying on rate limits and upstream server errors.
   * Building a year costs five requests fired together (the manifest plus one
   * page per block), which is enough to trip api.enem.dev's rate limiter on a
   * cold cache; without a retry the first visitor after a deploy gets an error.
   */
  private async get<T>(path: string): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        const { data } = await firstValueFrom(
          this.http.get<T>(`${this.baseUrl}${path}`),
        );
        return data;
      } catch (error) {
        const axiosError = error as AxiosError;
        const status = axiosError.response?.status;
        const retryable =
          status === 429 || status === undefined || status >= 500;

        if (!retryable || attempt >= MAX_RETRIES) {
          this.logger.error(
            `Upstream request failed: GET ${path} -> ${axiosError.message}`,
          );
          throw new ServiceUnavailableException(
            'Não foi possível consultar a API do ENEM no momento.',
          );
        }

        await sleep(RETRY_BASE_MS * 2 ** attempt);
      }
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
    const byYear = new Map<number, ExamData>();

    await Promise.all(
      years.map(async (year) => byYear.set(year, await this.getExam(year))),
    );

    return refs.map((ref) => {
      const question = byYear.get(ref.year)?.questions.get(ref.index);
      if (!question) {
        throw new BadRequestException(
          `Questão ${ref.index} não encontrada no ENEM ${ref.year}.`,
        );
      }
      return question;
    });
  }

  /** Grades answers against the key, which stays on the server. */
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

  /**
   * The questions a discipline can draw from, taken by position rather than by
   * the API's per-question labels, which are unreliable — see
   * `deriveDisciplineBlocks`.
   */
  private async getPool(year: number, discipline: string): Promise<Question[]> {
    if (discipline === 'ingles' || discipline === 'espanhol') {
      return this.getLanguagePool(year, discipline);
    }

    const exam = await this.getExam(year);
    const block = exam.blocks.get(discipline);
    if (!block) return [];

    const questions = [...exam.questions.values()].filter(
      (q) => q.index >= block.offset && q.index < block.end,
    );

    // The foreign-language questions open the Linguagens block, but they belong
    // to whichever language the student sat, not to Linguagens as a whole.
    return discipline === 'linguagens'
      ? questions.filter((q) => !q.language)
      : questions;
  }

  private getLanguagePool(year: number, language: string): Promise<Question[]> {
    const key = `${year}:${language}`;
    const cached = this.languagePools.get(key);
    if (cached) return cached;

    const pool = this.fetchLanguagePool(year, language).catch((error) => {
      this.languagePools.delete(key);
      throw error;
    });
    this.languagePools.set(key, pool);
    return pool;
  }

  private async fetchLanguagePool(
    year: number,
    language: string,
  ): Promise<Question[]> {
    const exam = await this.getExam(year);
    const block = exam.blocks.get('linguagens');
    if (!block) return [];

    // Anchored to the Linguagens block: before 2017 it started at 91, not 1,
    // and querying from the top of the exam simply found nothing.
    const data = await this.get<QuestionsResponse>(
      `/exams/${year}/questions?language=${language}&offset=${block.offset}&limit=10`,
    );
    return data.questions.filter((q) => q.language === language);
  }

  private getExam(year: number): Promise<ExamData> {
    const cached = this.exams.get(year);
    if (cached) return cached;

    const exam = this.fetchExam(year).catch((error) => {
      this.exams.delete(year);
      throw error;
    });
    this.exams.set(year, exam);
    return exam;
  }

  private async fetchExam(year: number): Promise<ExamData> {
    const details = await this.get<ExamDetails>(`/exams/${year}`);
    const blocks = deriveDisciplineBlocks(details.questions ?? []);

    // One page per block. Pages are requested a little wider than a block
    // because annulled questions leave gaps in the numbering (2023 has no 34
    // or 174), and `limit` counts questions returned, not indexes covered.
    const pages = await Promise.all(
      [...new Set([...blocks.values()].map((b) => b.offset))].map((offset) =>
        this.get<QuestionsResponse>(
          `/exams/${year}/questions?offset=${offset}&limit=${MAX_LIMIT}`,
        ),
      ),
    );

    const questions = new Map<number, Question>();
    for (const page of pages) {
      for (const question of page.questions) {
        questions.set(question.index, question);
      }
    }

    return { blocks, questions };
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
