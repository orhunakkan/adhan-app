import type { ChimePort } from '../core/ports';

type AudioContextCtor = new () => AudioContext;

/**
 * Soft two-note chime generated with Web Audio: the fallback when no azan
 * file can play (brief §10). The context is created inside the Start tap,
 * because iOS only lets a context make sound after a user gesture.
 */
export interface ChimeWindow {
  AudioContext?: AudioContextCtor;
  webkitAudioContext?: AudioContextCtor;
  setTimeout(fn: () => void, ms: number): unknown;
}

export function createWebAudioChime(win: ChimeWindow): ChimePort {
  let ctx: AudioContext | null = null;
  return {
    unlock() {
      const Ctor = win.AudioContext ?? win.webkitAudioContext;
      if (!Ctor) return;
      const c = ctx ?? new Ctor();
      ctx = c;
      void c.resume();
    },
    play() {
      const c = ctx;
      if (!c) return Promise.resolve();
      // After Siri or a call Safari can leave the context suspended/interrupted.
      void c.resume();
      const notes = [659.25, 523.25]; // E5 → C5
      const start = c.currentTime + 0.05;
      notes.forEach((freq, i) => {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = start + i * 0.9;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.6, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
        osc.connect(gain).connect(c.destination);
        osc.start(t);
        osc.stop(t + 1.7);
      });
      return new Promise((resolve) => win.setTimeout(resolve, 2700));
    },
  };
}
