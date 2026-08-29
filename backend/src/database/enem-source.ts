import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Discipline } from '../common/question';
import { deriveDisciplineBlocks, ManifestEntry } from './discipline-blocks';

const BASE_URL = process.env.ENEM_API_URL ?? 'https://api.enem.dev/v1';

const REQUEST_SPACING_MS = 1100;

const MAX_LIMIT = 50;

const LAST_INDEX = 180;

const MAX_RETRIES = 4;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ApiAlternative {
  letter: string;
  text: string | null;
  file: string | null;
  isCorrect?: boolean;
}

export interface ApiQuestion {
  title: string;
  index: number;
  year: number;
  discipline: string | null;
  language: string | null;
  context: string | null;
  files?: string[];
  correctAlternative?: string;
  alternativesIntroduction?: string | null;
  alternatives: ApiAlternative[];
}

export interface ExamSummary {
  title: string;
  year: number;
  disciplines: Discipline[];
  languages: Discipline[];
}

export interface ExamDetails extends ExamSummary {
  questions: ManifestEntry[];
}

interface QuestionsResponse {
  metadata: { limit: number; offset: number; total: number; hasMore: boolean };
  questions: ApiQuestion[];
}

export interface RawExam {
  details: ExamDetails;
  questions: ApiQuestion[];
}

export class EnemSource {
  private nextSlot = 0;

  constructor(
    private readonly cacheDir: string,
    private readonly log: (message: string) => void = console.log,
  ) {}

  async listYears(): Promise<number[]> {
    const exams = await this.get<ExamSummary[]>('/exams');
    return exams.map((exam) => exam.year).sort((a, b) => b - a);
  }

  async loadYear(year: number, refetch = false): Promise<RawExam> {
    const file = join(this.cacheDir, `${year}.json`);

    if (!refetch) {
      const cached = await readFile(file, 'utf8').catch(() => null);
      if (cached) {
        this.log(`${year}: cache`);
        return JSON.parse(cached) as RawExam;
      }
    }

    const exam = await this.fetchYear(year);
    await mkdir(this.cacheDir, { recursive: true });
    await writeFile(file, JSON.stringify(exam));
    return exam;
  }

  private async fetchYear(year: number): Promise<RawExam> {
    const details = await this.get<ExamDetails>(`/exams/${year}`);

    const questions = new Map<string, ApiQuestion>();
    const collect = (page: ApiQuestion[]) => {
      for (const question of page) {
        questions.set(`${question.index}:${question.language ?? ''}`, question);
      }
    };

    collect(await this.fetchAll(year));

    const linguagens = deriveDisciplineBlocks(details.questions ?? []).get(
      'linguagens',
    );

    for (const language of details.languages) {
      const page = await this.fetchPage(
        year,
        linguagens?.offset ?? 1,
        10,
        language.value,
      );
      collect(page.questions);
    }

    const sorted = [...questions.values()].sort(
      (a, b) =>
        a.index - b.index || (a.language ?? '').localeCompare(b.language ?? ''),
    );

    this.log(`${year}: ${sorted.length} questões`);
    return { details, questions: sorted };
  }

  private async fetchAll(year: number): Promise<ApiQuestion[]> {
    const collected: ApiQuestion[] = [];
    let offset = 1;

    for (;;) {
      const page = await this.fetchPage(year, offset, MAX_LIMIT);
      if (page.questions.length === 0) break;

      collected.push(...page.questions);

      const highest = Math.max(...page.questions.map((q) => q.index));
      if (!page.metadata.hasMore || highest >= LAST_INDEX) break;
      if (highest < offset) break;

      offset = highest + 1;
    }

    return collected;
  }

  private async fetchPage(
    year: number,
    offset: number,
    limit: number,
    language?: string,
  ): Promise<QuestionsResponse> {
    const suffix = language ? `&language=${language}` : '';
    return this.get<QuestionsResponse>(
      `/exams/${year}/questions?offset=${offset}&limit=${limit}${suffix}`,
    );
  }

  private async get<T>(path: string): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      await this.waitForSlot();
      this.log(`  GET ${path}`);

      const response = await fetch(`${BASE_URL}${path}`).catch(
        (error: unknown) => error as Error,
      );

      if (response instanceof Response && response.ok) {
        return (await response.json()) as T;
      }

      const status = response instanceof Response ? response.status : 0;
      const retryable = status === 429 || status === 0 || status >= 500;

      if (!retryable || attempt >= MAX_RETRIES) {
        throw new Error(`GET ${path} falhou (${status || 'sem resposta'})`);
      }

      const reset =
        response instanceof Response
          ? Number(response.headers.get('x-ratelimit-reset'))
          : 0;
      const wait =
        (Number.isFinite(reset) && reset > 0 ? reset : 2000) * 2 ** attempt;
      this.log(`  ${status || 'rede'} em ${path} — aguardando ${wait}ms`);
      await sleep(wait);
    }
  }

  private async waitForSlot(): Promise<void> {
    const wait = this.nextSlot - Date.now();
    if (wait > 0) await sleep(wait);
    this.nextSlot = Date.now() + REQUEST_SPACING_MS;
  }
}
