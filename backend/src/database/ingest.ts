import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { join } from 'node:path';
import { EnemSource } from './enem-source';
import { loadExam } from './load-exam';

config();

const CACHE_DIR = join(__dirname, '..', '..', 'data', 'enem');

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const refetch = args.includes('--refetch');
  const requested = args.filter((arg) => /^\d{4}$/.test(arg)).map(Number);

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não definida — veja backend/.env.example.');
  }

  const prisma = new PrismaClient();

  try {
    const source = new EnemSource(CACHE_DIR);
    const years = requested.length > 0 ? requested : await source.listYears();

    let total = 0;

    for (const year of years) {
      const exam = await source.loadYear(year, refetch);
      const { questions, blocks } = await loadExam(prisma, exam);
      total += questions;
      console.log(`${year}: ${questions} questões, ${blocks} blocos`);
    }

    console.log(`\n${total} questões em ${years.length} anos.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
