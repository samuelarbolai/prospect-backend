FROM node:20-slim AS base

WORKDIR /app

# Copy service manifest files
# Note: These files are now relative to the current folder, not a monorepo root.
COPY package.json package-lock.json ./

# Install dependencies for this service
# No need for --workspace flags
RUN npm ci

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