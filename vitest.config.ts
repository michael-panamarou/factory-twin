import { defineConfig } from 'vitest/config';

// One Vitest run covers every workspace; each project keeps its own environment.
export default defineConfig({
  test: {
    projects: ['packages/shared', 'apps/sim-server', 'apps/web'],
  },
});
