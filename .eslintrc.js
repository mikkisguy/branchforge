module.exports = {
  root: true,
  ignorePatterns: [
    '**/dist/**',
    '**/dist-schema/**',
    '**/node_modules/**',
    '**/coverage/**',
    '**/*.tsbuildinfo',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  extends: ['eslint:recommended', 'prettier'],
  rules: {
    'no-unused-vars': 'off',
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      parser: '@typescript-eslint/parser',
      extends: ['eslint:recommended', 'prettier'],
      rules: {
        'no-unused-vars': 'off',
        'no-undef': 'off',
        'no-redeclare': 'off', // TypeScript allows type+const with same name
      },
    },
  ],
};
