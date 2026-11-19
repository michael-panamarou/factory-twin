# Build from the repository root:
#   docker build -f apps/sim-server/Dockerfile -t factory-twin-sim .
#   docker run -p 8787:8787 factory-twin-sim
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Workspace manifests first, so dependency installs are cached.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/sim-server/package.json apps/sim-server/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @factory-twin/sim-server --omit=dev --ignore-scripts

COPY packages/shared/src packages/shared/src
COPY apps/sim-server/src apps/sim-server/src

USER node
ENV PORT=8787
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:${PORT}/health || exit 1
CMD ["npm", "run", "start", "--workspace", "@factory-twin/sim-server"]
