module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        moduleResolution: 'node',
        module: 'commonjs',
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        paths: { '@/*': ['./*'] },
      },
    }],
  },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
};
