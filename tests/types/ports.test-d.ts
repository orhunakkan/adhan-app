import { describe, expectTypeOf, it } from 'vitest';
import type {
  BlobStore,
  Clock,
  KeyValueStore,
  MediaPlayer,
  Rng,
  WakeLockPort,
} from '../../src/core/ports';
import type { FakeClock } from '../helpers/fakeClock';
import type { FakeMediaPlayer } from '../helpers/fakeMediaPlayer';
import type { FakeWakeLock } from '../helpers/fakeWakeLock';
import type { MemoryBlobStore } from '../helpers/memoryBlobStore';
import type { MemoryStore } from '../helpers/memoryStore';
import type { seededRng } from '../helpers/seededRng';

describe('fakes satisfy the ports', () => {
  it('matches each port interface', () => {
    expectTypeOf<FakeClock>().toExtend<Clock>();
    expectTypeOf<FakeMediaPlayer>().toExtend<MediaPlayer>();
    expectTypeOf<FakeWakeLock>().toExtend<WakeLockPort>();
    expectTypeOf<MemoryStore>().toExtend<KeyValueStore>();
    expectTypeOf<MemoryBlobStore>().toExtend<BlobStore>();
    expectTypeOf<ReturnType<typeof seededRng>>().toExtend<Rng>();
  });
});
