# System Overview

## Purpose

Build a small but real event-driven system to understand RabbitMQ deeply using live public data feeds. This is a learning MVP, not a production system.

## Learning Objectives

By building this system, you will understand:

- **Exchanges vs Queues** - How messages flow through RabbitMQ's routing layer
- **Routing Keys** - Pattern-based message routing using topic exchanges
- **Consumer Ack/Nack** - Manual acknowledgment and message rejection
- **Retries and DLQs** - Handling failures gracefully with dead letter queues
- **Idempotency** - Processing messages safely when they may be redelivered
- **Horizontal Scaling** - Running multiple competing consumers

## High-Level Architecture

```
┌─────────────────┐     ┌─────────────────┐
│  Carbon API     │     │  Weather API    │
│  Ingester       │     │  Ingester       │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │   publish             │   publish
         ▼                       ▼
┌─────────────────────────────────────────┐
│              RabbitMQ                   │
│  ┌─────────────────────────────────┐    │
│  │     Topic Exchange: feeds       │    │
│  └─────────────────────────────────┘    │
│         │                   │           │
│    ┌────┴────┐         ┌────┴────┐      │
│    │ Queue:  │         │ Queue:  │      │
│    │ carbon  │         │ weather │      │
│    └────┬────┘         └────┬────┘      │
│         │                   │           │
└─────────┼───────────────────┼───────────┘
          │                   │
          ▼                   ▼
┌─────────────────┐  ┌─────────────────┐
│  Consumer:      │  │  Consumer:      │
│  Logger         │  │  Aggregator     │
└─────────────────┘  └─────────────────┘
```

## Components

### Ingesters (Producers)

Two polling services that fetch data from external APIs and publish messages to RabbitMQ:

1. **Carbon Ingester** - Polls UK Carbon Intensity API every 30 seconds to 5 minutes
2. **Weather Ingester** - Polls OpenWeather API every 5 to 15 minutes

### Message Broker

RabbitMQ handles message routing and delivery guarantees:

- **Topic Exchange** - Routes messages based on routing key patterns
- **Queues** - Buffer messages for consumers with configurable durability
- **Dead Letter Queue** - Captures messages that fail processing

### Consumers

Independent services that process messages from queues:

1. **Logger Consumer** - Logs all incoming messages (demonstrates fan-out)
2. **Aggregator Consumer** - Combines carbon and weather data (demonstrates routing)
3. **Alert Consumer** - Triggers alerts on threshold breaches (demonstrates filtering)

## Technology Stack

- **Language**: TypeScript/Node.js
- **RabbitMQ Client**: amqplib
- **RabbitMQ**: Docker container (rabbitmq:3-management)

## What Makes This Project Effective for Learning

1. **Real, changing data** - Not fake demos; actual live feeds that change over time
2. **True pub/sub fan-out** - Multiple consumers can independently process the same messages
3. **Failure scenarios** - External APIs can fail, teaching real error handling
4. **Observable** - RabbitMQ Management UI lets you see queues, messages, and consumers
