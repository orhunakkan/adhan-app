import type { ChimePort } from '../../src/core/ports';

export class FakeChime implements ChimePort {
  unlocked = 0;
  played = 0;
  unlock(): void {
    this.unlocked++;
  }
  hold = false;
  private pending: Array<() => void> = [];
  play(): Promise<void> {
    this.played++;
    if (!this.hold) return Promise.resolve();
    return new Promise((r) => this.pending.push(r));
  }
  finish(): void {
    for (const r of this.pending.splice(0)) r();
  }
}
