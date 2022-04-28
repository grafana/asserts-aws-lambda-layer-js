/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageProvider: "v8",
  reporters: [
    "default",
    ["jest-junit", {"outputDirectory": "reports", "outputName": "report.xml"}]
  ]
};