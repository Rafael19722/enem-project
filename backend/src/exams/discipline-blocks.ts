/**
 * The ENEM lays its 180 questions out in four contiguous 45-question blocks,
 * one per discipline — but which discipline sits in which block is not fixed
 * across years. The exam was restructured in 2017, and 2009 differs again:
 *
 *   2017-2023   linguagens, ciencias-humanas, ciencias-natureza, matematica
 *   2010-2016   ciencias-humanas, ciencias-natureza, linguagens, matematica
 *   2009        ciencias-natureza, ciencias-humanas, linguagens, matematica
 *
 * Hardcoding one layout silently returned the wrong subject (or nothing at all)
 * for every year before 2017, so the layout is derived per year from the exam's
 * own question manifest instead.
 */

/** Questions per discipline block. The exam is always 4 × 45 = 180. */
export const BLOCK_SIZE = 45;

const BLOCK_COUNT = 4;

export const KNOWN_DISCIPLINES = [
  'linguagens',
  'ciencias-humanas',
  'ciencias-natureza',
  'matematica',
  'ingles',
  'espanhol',
] as const;

export type KnownDiscipline = (typeof KNOWN_DISCIPLINES)[number];

/** The subset of a manifest entry needed to place a discipline in a block. */
export interface ManifestEntry {
  index: number;
  discipline: string | null;
}

export interface DisciplineBlock {
  /** 1-based index of the block's first question. */
  offset: number;
  /** Index just past the block's last question. */
  end: number;
}

export function isKnownDiscipline(value: string): value is KnownDiscipline {
  return (KNOWN_DISCIPLINES as readonly string[]).includes(value);
}

function blockOf(index: number): number {
  return Math.floor((index - 1) / BLOCK_SIZE);
}

/**
 * Maps each discipline to the block it occupies, by majority vote.
 *
 * A vote is used rather than trusting entries directly because the API's
 * per-question `discipline` labels contain errors — ENEM 2023 tags question 30
 * (a prose passage, plainly Linguagens) as ciencias-humanas, and mislabels ten
 * of its Ciências da Natureza questions. Position within the booklet is the
 * reliable signal; across all 15 published years every discipline wins its
 * block with 57-100% of its own entries, and no two disciplines ever contend
 * for the same block.
 */
export function deriveDisciplineBlocks(
  manifest: ManifestEntry[],
): Map<string, DisciplineBlock> {
  const votes = new Map<string, number[]>();

  for (const entry of manifest) {
    if (!entry.discipline) continue;

    const block = blockOf(entry.index);
    if (block < 0 || block >= BLOCK_COUNT) continue;

    let tally = votes.get(entry.discipline);
    if (!tally) {
      tally = new Array<number>(BLOCK_COUNT).fill(0);
      votes.set(entry.discipline, tally);
    }
    tally[block]++;
  }

  const blocks = new Map<string, DisciplineBlock>();

  for (const [discipline, tally] of votes) {
    const winner = tally.indexOf(Math.max(...tally));
    const offset = winner * BLOCK_SIZE + 1;
    blocks.set(discipline, { offset, end: offset + BLOCK_SIZE });
  }

  return blocks;
}
