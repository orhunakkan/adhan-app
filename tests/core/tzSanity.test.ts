import { describe, expect, it } from 'vitest';

describe('process time zone pinning', () => {
  it.runIf(process.env.TZ === 'UTC')('runs in UTC under core-tz-utc', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(0);
  });

  it.runIf(process.env.TZ === 'Asia/Tokyo')('runs in Asia/Tokyo under core-tz-tokyo', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-540);
  });

  it('local Date fields follow the process zone, which the core code must not rely on', () => {
    expect(typeof Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('string');
  });
});
