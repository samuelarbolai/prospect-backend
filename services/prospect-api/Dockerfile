FROM node:20-slim AS base
ARG CACHE_BUST=2

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-cache

# Copy all source files
# Note: You only need to copy 'src' and any other necessary files now.
COPY . .

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