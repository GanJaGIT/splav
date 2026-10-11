import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'release/',
      'test-results/',
      'coverage/',
      'node_modules/',
      'dist-e2e/',
      '.claude/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // UI-09: only in-game windows.
      'no-alert': 'error',
      'no-restricted-globals': [
        'error',
        { name: 'YaGames', message: 'TECH-11: YaGames only in src/platform.' },
        { name: 'ysdk', message: 'TECH-11: ysdk only in src/platform.' },
      ],
    },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser },
    },
  },
  {
    files: ['src/platform/**/*.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
  {
    // TECH-10, SIM-24: the simulation is pure and deterministic.
    files: ['src/sim/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        'localStorage',
        'performance',
        'requestAnimationFrame',
        'setTimeout',
        'setInterval',
        { name: 'Date', message: 'SIM-24: Date is forbidden in src/sim.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'SIM-24: use mulberry32 from the state.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['phaser', 'phaser/*'], message: 'TECH-10: no Phaser in src/sim.' },
            {
              group: ['**/platform/**', '**/ui/**', '**/game/**', '**/services/**'],
              message: 'TECH-10: src/sim does not depend on the platform, UI or rendering.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.ts', 'tests/**/*.ts', '*.config.ts', '*.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  prettier,
);
