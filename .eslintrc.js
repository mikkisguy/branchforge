module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  extends: ['eslint:recommended'],
  rules: {
    'no-unused-vars': 'off',
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      parser: '@typescript-eslint/parser',
      extends: ['eslint:recommended'],
      rules: {
        'no-unused-vars': 'off',
        'no-undef': 'off',
      },
    },
  ],
};
