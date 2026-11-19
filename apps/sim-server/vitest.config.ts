import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'sim-server',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
