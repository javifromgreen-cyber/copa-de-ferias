// Tiny deterministic hash so mock providers return stable-but-varied data
// per trip (no randomness — a quote recomputed later must reproduce the
// same numbers unless the underlying "inventory" is deliberately changed).
export function seededInt(seed: string, min: number, max: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const range = max - min + 1;
  return min + (hash % range);
}
