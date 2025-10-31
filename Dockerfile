FROM node:22-bullseye

# Install system dependencies (ffmpeg includes ffprobe)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    fontconfig \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Expose port expected by fly.toml
ENV PORT=3000
EXPOSE 3000

# Start express backend (Next build not required for worker API)
CMD ["node", "railway-backend.js"]


