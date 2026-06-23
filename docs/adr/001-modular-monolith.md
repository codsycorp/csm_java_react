# ADR-001: Modular Monolith for CSM Go

## Status
Accepted

## Context
CSM serves multi-tenant SaaS with Java parity, embedded Pebble, and local LLM. Team size is small; ops budget favors single VM deployment.

## Decision
Remain a **modular monolith** with clear internal packages (`platform/`, `data/`, `services/`). Defer microservices until horizontal write scale is proven necessary.

## Consequences
- **Positive:** Low latency, simple deploy, embedded privacy for AI/RAG
- **Negative:** Single-writer Pebble; scale-out requires outbox + read replicas or warehouse
- **Trigger to revisit:** >50M rows/table OR sustained >2k mutations/s OR multi-region requirement
