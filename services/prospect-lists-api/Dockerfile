FROM node:20-slim AS base

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared-firestore/package.json packages/shared-firestore/
COPY services/prospect-lists-api/package.json services/prospect-lists-api/

RUN npm ci --workspace services/prospect-lists-api --include-workspace-root=false

COPY packages packages
COPY services/prospect-lists-api services/prospect-lists-api

RUN npm run build --workspace services/prospect-lists-api

RUN npm prune --omit=dev --workspace services/prospect-lists-api --include-workspace-root=false

ENV NODE_ENV=production

WORKDIR /app/services/prospect-lists-api

EXPOSE 8080

CMD ["node", "dist/index.js"]
