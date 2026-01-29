# Implementation Tasks

Checklist for building the UK Carbon + Weather Live Feed Hub MVP.

## Phase 1: Project Setup

- [x] Initialize Node.js project with TypeScript
- [x] Configure TypeScript (tsconfig.json)
- [x] Add dependencies: amqplib, @types/amqplib, dotenv
- [x] Create docker-compose.yml for RabbitMQ
- [x] Create .env.example with required environment variables
- [x] Set up project folder structure

## Phase 2: RabbitMQ Infrastructure

- [x] Create connection manager with auto-reconnect
- [x] Create topology setup script (exchanges, queues, bindings)
- [x] Verify topology in RabbitMQ Management UI
- [x] Test connection recovery (stop/start RabbitMQ)

## Phase 3: Message Envelope

- [x] Define TypeScript types for message envelope
- [x] Define types for carbon intensity message
- [x] Define types for weather message
- [x] Create envelope factory function (generates ID, timestamp)

## Phase 4: Carbon Intensity Ingester

- [x] Create HTTP client for Carbon Intensity API
- [x] Transform API response to internal message format
- [x] Implement polling loop with configurable interval
- [x] Publish messages to feeds.topic exchange
- [x] Add error handling with exponential backoff
- [x] Test with real API data

## Phase 5: Weather Ingester

- [x] Create HTTP client for OpenWeather API
- [x] Handle API key configuration
- [x] Transform API response to internal message format
- [x] Implement polling loop with configurable interval
- [x] Publish messages to feeds.topic exchange
- [x] Add error handling with exponential backoff
- [x] Handle rate limiting (429 responses)
- [x] Test with real API data (requires OPENWEATHER_API_KEY)

## Phase 6: Logger Consumer

- [x] Create consumer that binds to feeds.all queue
- [x] Implement message acknowledgment
- [x] Log received messages with timestamp and routing key
- [x] Test fan-out (receives both carbon and weather)

## Phase 7: Aggregator Consumer

- [x] Create consumer that binds to feeds.carbon queue
- [x] Implement prefetch configuration
- [x] Process and log carbon intensity data
- [x] Demonstrate competing consumers (run 2 instances)

## Phase 8: Error Handling & DLQ

- [ ] Implement retry count tracking via message headers
- [ ] Add nack with requeue for transient errors
- [ ] Add nack without requeue after max retries
- [ ] Create DLQ inspector (view failed messages)
- [ ] Test poison message scenario

## Phase 9: Idempotency

- [ ] Implement in-memory message ID cache
- [ ] Skip duplicate messages based on ID
- [ ] Add TTL to cache entries
- [ ] Test with simulated redelivery

## Phase 10: Polish & Documentation

- [ ] Create start scripts in package.json
- [ ] Write README with setup instructions
- [ ] Add graceful shutdown handling
- [ ] Final end-to-end test

---

## Quick Start Commands (for reference)

```bash
# Start RabbitMQ
docker-compose up -d

# Run ingesters
npm run start:carbon-ingester
npm run start:weather-ingester

# Run consumers
npm run start:logger
npm run start:aggregator

# View RabbitMQ UI
open http://localhost:15672
```

## Definition of Done (MVP)

- [ ] RabbitMQ running in Docker
- [ ] Both ingesters polling real APIs and publishing messages
- [ ] Logger consumer receiving all messages
- [ ] Aggregator consumer processing carbon messages
- [ ] Failed messages appearing in DLQ
- [ ] System recovers from RabbitMQ restart
