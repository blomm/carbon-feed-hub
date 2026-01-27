# Specification Index

This document lists all specification files for the UK Carbon + Weather Live Feed Hub.

## Implementation Roadmap

- [tasks.md](tasks.md) - Implementation checklist organized by phase

## Specification Files

- [system_overview.md](system_overview.md) - Learning objectives and high-level system description
- [architecture.md](architecture.md) - RabbitMQ topology, exchanges, queues, routing
- [data_sources.md](data_sources.md) - UK Carbon Intensity API and OpenWeather API details
- [data_models.md](data_models.md) - Message schemas and envelope format
- [rabbitmq_patterns.md](rabbitmq_patterns.md) - Core RabbitMQ concepts and patterns
- [error_handling.md](error_handling.md) - Retries, DLQs, idempotency
- [testing_strategy.md](testing_strategy.md) - Local setup and testing approaches

## Instructions for Any Model

1. Load all spec files before beginning work.
2. Follow these specifications exactly.
3. Do not invent new APIs or tools unless explicitly instructed.
4. Any update to code must stay compliant with the specs.
5. If specs are unclear or incomplete, ask for clarification before proceeding.
