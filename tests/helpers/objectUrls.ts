import { vi } from 'vitest';

/** Tracks object URL creation and revocation so tests can assert there are no leaks. */
export const objectUrls = {
  created: [] as string[],
  revoked: [] as string[],
  get live(): string[] {
    return this.created.filter((u) => !this.revoked.includes(u));
  },
};

let counter = 0;

export function stubObjectUrls(): void {
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    const url = `blob:fake/${++counter}`;
    objectUrls.created.push(url);
    return url;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
    objectUrls.revoked.push(url);
  });
}

export function resetObjectUrls(): void {
  objectUrls.created.length = 0;
  objectUrls.revoked.length = 0;
}
