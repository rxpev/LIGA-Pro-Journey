export function levelFromElo(elo: number): number {
  // tweak ranges to taste
  if (elo < 801) return 1;
  if (elo < 951) return 2;
  if (elo < 1101) return 3;
  if (elo < 1251) return 4;
  if (elo < 1401) return 5;
  if (elo < 1551) return 6;
  if (elo < 1701) return 7;
  if (elo < 1851) return 8;
  if (elo < 2000) return 9;
  return 10;
}
