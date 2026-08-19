# Vectorography as one container: the app is built, then served by the same
# process that owns the space. Hugging Face Spaces runs this as-is.

# ---- build the app ----------------------------------------------------------
FROM node:22-slim AS app
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- serve it, and the space it reads from ----------------------------------
FROM python:3.12-slim
WORKDIR /app

# Spaces runs containers as a non-root user, and pip needs somewhere to write.
RUN useradd -m -u 1000 traveller
ENV PATH="/home/traveller/.local/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY --chown=traveller backend/requirements.txt backend/requirements.txt
USER traveller
RUN pip install --no-cache-dir --user -r backend/requirements.txt

COPY --chown=traveller backend/ backend/
COPY --chown=traveller --from=app /build/dist frontend/dist

# The corpus font files are not shipped: three hundred megabytes of them, and
# the app falls back to a plain face when a family's own file is missing.
# Spaces fixes the port at 7860; Cloud Run hands one over in the environment
# and will not route to a container listening anywhere else.
EXPOSE 7860
CMD ["sh", "-c", "python -m uvicorn main:app --app-dir backend \
     --host 0.0.0.0 --port ${PORT:-7860}"]
