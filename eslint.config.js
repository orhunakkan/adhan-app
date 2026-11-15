// @ts-check
import js from '@eslint/js';
import compat from 'eslint-plugin-compat';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Side effects (time, randomness, storage, wake lock, audio) are only allowed in
 * main.ts and src/adapters/** — everything else receives them through ports
 * (SPEC "Code Style", brief §16). Regex lookbehind is banned everywhere in src
 * because Safari 15 throws a SyntaxError on it at parse time.
 */
const LOOKBEHIND = [
  {
    selector: 'Literal[regex.pattern=/\\(\\?<[=!]/]',
    message: 'Regex lookbehind is unsupported in Safari 15.',
  },
  {
    selector:
      ':matches(NewExpression, CallExpression)[callee.name="RegExp"] > Literal[value=/\\(\\?<[=!]/]',
    message: 'Regex lookbehind is unsupported in Safari 15.',
  },
];

const SIDE_EFFECTS = [
  {
    selector: 'CallExpression[callee.object.name="Date"][callee.property.name="now"]',
    message: 'Use the injected Clock port instead of Date.now().',
  },
  {
    selector: 'NewExpression[callee.name="Date"][arguments.length=0]',
    message: 'Use the injected Clock port instead of new Date().',
  },
  {
    selector: 'MemberExpression[object.name="Math"][property.name="random"]',
    message: 'Use the injected Rng port instead of Math.random.',
  },
  {
    selector: 'MemberExpression[object.name="navigator"][property.name="wakeLock"]',
    message: 'Use the WakeLockPort instead of navigator.wakeLock.',
  },
  {
    selector: 'NewExpression[callee.name="Audio"]',
    message: 'Use the MediaPlayer port; the single audio element is created in an adapter.',
  },
  {
    selector:
      'MemberExpression[object.name=/^(window|globalThis|self)$/][property.name=/^(setInterval|localStorage|indexedDB)$/]',
    message: 'Use the injected Clock / KeyValueStore / BlobStore ports.',
  },
];

const RESTRICTED_GLOBALS = ['setInterval', 'localStorage', 'indexedDB'].map((name) => ({
  name,
  message: 'Use the injected port (Clock / KeyValueStore / BlobStore) instead.',
}));

// Globals Safari 15 lacks that eslint-plugin-compat does not catch as bare calls.
const UNSUPPORTED_GLOBALS = ['requestIdleCallback', 'cancelIdleCallback'].map((name) => ({
  name,
  message: 'Not available in Safari 15.',
}));

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/', 'dev-dist/'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['vite.config.ts', 'vitest.config.ts'],
          defaultProject: 'tsconfig.node.json',
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.ts'],
    ...compat.configs['flat/recommended'],
    languageOptions: { globals: globals.browser },
    rules: {
      ...compat.configs['flat/recommended'].rules,
      'no-restricted-globals': ['error', ...RESTRICTED_GLOBALS, ...UNSUPPORTED_GLOBALS],
      'no-restricted-syntax': ['error', ...SIDE_EFFECTS, ...LOOKBEHIND],
    },
  },
  {
    files: ['src/main.ts', 'src/adapters/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...UNSUPPORTED_GLOBALS],
      'no-restricted-syntax': ['error', ...LOOKBEHIND],
    },
  },
  {
    files: ['tests/**/*.ts', '*.config.ts', '*.config.js', 'scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
);
