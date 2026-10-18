module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature
        'fix',      // Bug fix
        'docs',     // Documentation only
        'style',    // Formatting, no code change
        'refactor', // Code change that neither fixes a bug nor adds a feature
        'test',     // Adding missing tests
        'chore',    // Maintain (dependencies, config)
        'perf',     // Performance improvement
        'ci',       // CI/CD changes
        'build',    // Build system changes
        'revert'    // Revert a commit
      ]
    ],
    'scope-enum': [
      2,
      'always',
      [
        'tts',
        'stt',
        'dyslexia',
        'ui',
        'popup',
        'content',
        'canvas',
        'moodle',
        'classroom',
        'profiles',
        'focus',
        'guide',
        'overlay',
        'accessibility',
        'test',
        'ci',
        'docs',
        'build',
        'deps'
      ]
    ],
    'subject-case': [
      2,
      'never',
      ['sentence-case', 'start-case', 'pascal-case', 'upper-case']
    ],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never']
  }
};
