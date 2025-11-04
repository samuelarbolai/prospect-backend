FROM node:20-slim AS base

WORKDIR /app

# Copy root workspace manifests and the service manifests
COPY package.json package-lock.json ./
COPY packages/shared-firestore/package.json packages/shared-firestore/
COPY services/prospect-api/package.json services/prospect-api/

# Install only this workspace's dependencies
RUN npm ci --workspace services/prospect-api --include-workspace-root=false

# Copy workspace sources
COPY packages packages
COPY services/prospect-api services/prospect-api

# Ensure shared workspace is built so compiled outputs are available during API build
RUN npm run build --workspace @prospect/shared-firestore

# Build just the prospect-api workspace
RUN npm run build --workspace services/prospect-api

# Prune dev dependencies scoped to the workspace
RUN npm prune --omit=dev --workspace services/prospect-api --include-workspace-root=false

ENV NODE_ENV=production

WORKDIR /app/services/prospect-api

EXPOSE 8080

CMD ["node", "dist/index.js"]
