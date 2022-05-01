/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverage: true,
  coverageDirectory: "dist/tests/coverage",
  coverageProvider: "v8",
  reporters: [
    "default",
    ["jest-junit", {"outputDirectory": "dist/tests", "outputName": "report.xml"}]
  ]
};