# Multi-stage build for CSM Go backend (production).
# Native llama requires CGO — use build-go-linux-native.sh on CI or build with:
#   docker build --build-arg LLAMACPP=1 -f backend-go/Dockerfile .

FROM golang:1.25-bookworm AS builder
WORKDIR /src
COPY backend-go/go.mod backend-go/go.sum ./backend-go/
WORKDIR /src/backend-go
RUN go mod download
COPY backend-go/ ./
ARG LLAMACPP=0
RUN if [ "$LLAMACPP" = "1" ]; then \
      apt-get update && apt-get install -y build-essential cmake && \
      CGO_ENABLED=1 go build -tags llamacpp -o /out/csm-go ./cmd/server; \
    else \
      CGO_ENABLED=0 go build -o /out/csm-go ./cmd/server; \
    fi

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /out/csm-go /app/csm-go
ENV SERVER_HOST=0.0.0.0 \
    SERVER_PORT=9999 \
    CSM_STRUCTURED_LOGS=true \
    CSM_METRICS_ENABLED=true
EXPOSE 9999 15301
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:9999/live || exit 1
ENTRYPOINT ["/app/csm-go"]
