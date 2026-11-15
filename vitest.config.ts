import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

const CORE_95 = { lines: 95, branches: 95, functions: 95, statements: 95 };

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      restoreMocks: true,
      unstubEnvs: true,
      unstubGlobals: true,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts'],
        exclude: ['src/main.ts', 'src/**/*.d.ts', 'src/core/ports.ts'],
        reporter: ['text-summary', 'text', 'html', 'json-summary'],
        thresholds: {
          lines: 90,
          branches: 90,
          functions: 90,
          statements: 90,
          'src/core/**': CORE_95,
          'src/design/**': CORE_95,
          'src/ui/**': { lines: 85, branches: 85, functions: 85, statements: 85 },
        },
      },
      benchmark: { include: ['tests/bench/**/*.bench.ts'] },
      projects: [
        {
          extends: true,
          test: {
            name: 'core',
            environment: 'node',
            include: ['tests/core/**/*.test.ts'],
            typecheck: {
              enabled: true,
              include: ['tests/types/**/*.test-d.ts'],
              tsconfig: './tests/tsconfig.json',
            },
          },
        },
        // The same core suite again under pinned process time zones: results
        // must never depend on the machine's zone (brief §13.3).
        ...(['UTC', 'Asia/Tokyo'] as const).map((tz) => ({
          extends: true as const,
          test: {
            name: `core-tz-${tz === 'UTC' ? 'utc' : 'tokyo'}`,
            environment: 'node' as const,
            env: { TZ: tz },
            include: ['tests/core/**/*.test.ts'],
            exclude: ['tests/core/lintRules.test.ts', 'tests/core/scan.test.ts'],
          },
        })),
        {
          extends: true,
          test: {
            name: 'dom',
            environment: 'happy-dom',
            include: ['tests/dom/**/*.test.ts'],
            setupFiles: ['tests/setup/dom.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'build',
            environment: 'node',
            include: ['tests/build/**/*.test.ts'],
          },
        },
      ],
    },
  }),
);
