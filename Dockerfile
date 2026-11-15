# ==============================================================================
# Stage 1: Build React Frontend
# ==============================================================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend/frontend

# Install dependencies
COPY frontend/frontend/package*.json ./
RUN npm ci

# Copy frontend source and build production bundle
COPY frontend/frontend/ ./
RUN npm run build

# ==============================================================================
# Stage 2: Python Backend Runtime
# ==============================================================================
FROM python:3.11-slim AS runtime

WORKDIR /app

# Install system dependencies for psycopg2 and networking
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python backend dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend source code and config
COPY ESP32_CAM_Test/ ./ESP32_CAM_Test/
COPY Smart_Blind_Stick/ ./Smart_Blind_Stick/

# Copy built frontend bundle from Stage 1 into the location expected by main.py
COPY --from=frontend-builder /app/frontend/frontend/dist ./frontend/frontend/dist

# Expose default HTTP/WebSocket port
ENV PORT=8000
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api/health || exit 1

# Start FastAPI application with automatic dynamic port binding
CMD ["sh", "-c", "uvicorn ESP32_CAM_Test.volunteer_assistance.backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
