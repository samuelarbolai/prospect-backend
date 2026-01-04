FROM node:20-slim AS base
ARG CACHE_BUST=2

WORKDIR /app

# Copy package files from the service directory
COPY services/prospect-api/package.json services/prospect-api/package-lock.json ./
RUN npm ci --no-cache

# Copy all source files from the service directory
COPY services/prospect-api/ .

# Build the application
# Assuming your package.json has a 'build' script
RUN npm run build

# Prune dev dependencies
RUN npm prune --omit=dev

ENV NODE_ENV=production

# The working directory is already /app, but we can set it for clarity if needed
# WORKDIR /app 

EXPOSE 8080

# The compiled output is likely in /app/dist
CMD ["node", "dist/index.js"]