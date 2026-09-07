# ---- frontend build ----
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- backend runtime (serves the API + the built frontend + article PDFs) ----
FROM python:3.13-slim
WORKDIR /app

COPY backend/ backend/
RUN pip install --no-cache-dir "./backend[postgres]"

COPY data/ data/
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

WORKDIR /app/backend
ENV PYTHONUNBUFFERED=1
EXPOSE 8000

# Migrate schema, then load the checked-in extracted-entity JSON (idempotent
# upsert) before serving -- so a fresh deploy is never missing data.
CMD ["sh", "-c", "alembic upgrade head && python -m app.ingestion.load_entities && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
