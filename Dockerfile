FROM node:22-bullseye-slim

# Install build dependencies for 'usb' package and other native modules
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    libusb-1.0-0-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root manifests
COPY package.json package-lock.json* ./

# Copy sub-package manifests if they exist to satisfy dependencies
COPY pyth-roulette/package.json ./pyth-roulette/

# Force npm install (bypasses the ci sync error by allowing resolution)
RUN npm install --no-audit

# Copy everything else
COPY . .

# Set dynamic environment variables for build if needed
ENV NEXT_TELEMETRY_DISABLED=1

# Build the Next.js app (required even for worker if shared codebase)
RUN npm run build

# Default start command (Railway overrides this in the dashboard per service)
# For the worker, set "npm run entropy-bridge-worker" in Railway Start Command
CMD ["npm", "start"]
