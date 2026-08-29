import { Prisma, PrismaClient } from '@prisma/client';
import { deriveDisciplineBlocks } from './discipline-blocks';
import { RawExam } from './enem-source';

export async function loadExam(
  prisma: PrismaClient,
  exam: RawExam,
): Promise<{ questions: number; blocks: number }> {
  const { details, questions } = exam;
  const year = details.year;

  const blocks = deriveDisciplineBlocks(details.questions ?? []);

  const blockOf = (index: number): string | null => {
    for (const [discipline, block] of blocks) {
      if (index >= block.offset && index < block.end) return discipline;
    }
    return null;
  };

  await prisma.$transaction(async (tx) => {
    await tx.exam.upsert({
      where: { year },
      create: {
        year,
        title: details.title,
        disciplines: details.disciplines as unknown as Prisma.InputJsonValue,
        languages: details.languages as unknown as Prisma.InputJsonValue,
      },
      update: {
        title: details.title,
        disciplines: details.disciplines as unknown as Prisma.InputJsonValue,
        languages: details.languages as unknown as Prisma.InputJsonValue,
        syncedAt: new Date(),
      },
    });

    await tx.disciplineBlock.deleteMany({ where: { year } });
    await tx.disciplineBlock.createMany({
      data: [...blocks].map(([discipline, block]) => ({
        year,
        discipline,
        startIndex: block.offset,
        endIndex: block.end,
      })),
    });

    await tx.question.deleteMany({ where: { year } });

    for (const question of questions) {
      await tx.question.create({
        data: {
          year,
          index: question.index,
          language: question.language,
          title: question.title,
          discipline: question.discipline,
          blockDiscipline: blockOf(question.index),
          context: question.context,
          alternativesIntroduction: question.alternativesIntroduction,
          correctAlternative: question.correctAlternative ?? null,
          files: {
            create: (question.files ?? []).map((url, i) => ({
              position: i + 1,
              url,
            })),
          },
          alternatives: {
            create: (question.alternatives ?? []).map((alternative) => ({
              letter: alternative.letter,
              text: alternative.text,
              file: alternative.file,
              isCorrect:
                alternative.isCorrect ??
                alternative.letter === question.correctAlternative,
            })),
          },
        },
      });
    }
  });

  return { questions: questions.length, blocks: blocks.size };
}
