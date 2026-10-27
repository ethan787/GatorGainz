const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

if (!process.env.TEST_DATABASE_URL?.trim()) {
  throw new Error(
    'TEST_DATABASE_URL is required for database validation. Use a dedicated test database; see docs/ci.md.',
  );
}

module.exports = {
  ...require('./jest.config.cjs'),
  coverageDirectory: '<rootDir>/coverage',
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: '<rootDir>/test-results/jest',
        outputName: 'junit.xml',
        addFileAttribute: 'true',
        filePathPrefix: 'server',
        reportTestSuiteErrors: 'true',
      },
    ],
  ],
};
