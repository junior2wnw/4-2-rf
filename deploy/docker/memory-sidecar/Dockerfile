FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY apps/memory-sidecar/requirements.txt apps/memory-sidecar/pyproject.toml ./
RUN python -m pip install --upgrade pip setuptools wheel \
  && python -m pip install -r requirements.txt

COPY apps/memory-sidecar/app ./app

EXPOSE 8090

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8090"]
