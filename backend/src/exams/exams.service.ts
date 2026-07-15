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
  DISCIPLINE_RANGES,
  isKnownDiscipline,
} from './discipline-ranges';

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

@Injectable()
export class ExamsService {
  private readonly logger = new Logger(ExamsService.name);
  private readonly baseUrl: string;

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

  /** Randomly pick `amount` questions of a discipline for a given year. */
  async getRandomQuestions(
    year: number,
    discipline: string,
    amount: number,
  ): Promise<Question[]> {
    if (!isKnownDiscipline(discipline)) {
      throw new BadRequestException(
        `Disciplina desconhecida: "${discipline}".`,
      );
    }

    const pool = await this.fetchDisciplinePool(year, discipline);

    if (pool.length === 0) {
      throw new ServiceUnavailableException(
        'Nenhuma questão encontrada para essa disciplina/ano.',
      );
    }

    return this.sample(pool, Math.min(amount, pool.length));
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
