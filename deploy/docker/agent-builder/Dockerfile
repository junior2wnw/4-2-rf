FROM golang:1.26-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends zip python3 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY apps/agent ./apps/agent
COPY scripts/build-agent.sh ./scripts/build-agent.sh

RUN chmod +x ./scripts/build-agent.sh

CMD ["./scripts/build-agent.sh"]
