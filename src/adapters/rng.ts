import type { Rng } from '../core/ports';

export const mathRng: Rng = { next: () => Math.random() };
