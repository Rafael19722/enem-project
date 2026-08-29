export const BLOCK_SIZE = 45;

const BLOCK_COUNT = 4;

export interface ManifestEntry {
  index: number;
  discipline: string | null;
}

export interface DisciplineBlock {
  offset: number;
  end: number;
}

function blockOf(index: number): number {
  return Math.floor((index - 1) / BLOCK_SIZE);
}

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
