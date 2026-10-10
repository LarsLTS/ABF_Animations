module.exports = {
  root: true,
  env: { browser: true, node: true, es2022: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  extends: ['eslint:recommended'],
  globals: {
    game: 'readonly',
    Hooks: 'readonly',
    foundry: 'readonly',
    ui: 'readonly',
    canvas: 'readonly',
    Sequence: 'readonly',
    Sequencer: 'readonly',
    fromUuidSync: 'readonly'
  }
};
