// zod must never probe `new Function` under our CSP (it logs a violation).
import { describe, expect, it, vi } from 'vitest';

describe('zod configuration', () => {
  it('is jitless before any app schema is built, so no eval probe runs', async () => {
    vi.resetModules();
    const spy = vi.spyOn(globalThis, 'Function');
    try {
      const { settingsSchema } = await import('../../src/config/schema');
      const { defaultSettings } = await import('../../src/config/defaults');
      await import('../../src/core/cities');
      await import('../../src/core/panels');
      expect(settingsSchema.parse(defaultSettings)).toEqual(defaultSettings);
      const { z } = await import('../../src/config/zod');
      expect(z.config().jitless).toBe(true);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
