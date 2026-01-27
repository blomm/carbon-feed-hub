# Architecture

## RabbitMQ Topology

```
                              EXCHANGES
                    ┌─────────────────────────┐
                    │                         │
          ┌─────────┴─────────┐     ┌─────────┴─────────┐
          │  feeds.topic      │     │  feeds.dlx        │
          │  (topic exchange) │     │  (fanout exchange)│
          └─────────┬─────────┘     └─────────┬─────────┘
                    │                         │
          ┌─────────┴─────────────────────────┴─────────┐
          │                                             │
          │                    QUEUES                   │
          │                                             │
   ┌──────┴──────┐  ┌──────────────┐  ┌──────────────┐  │
   │             │  │              │  │              │  │
   │ feeds.all   │  │ feeds.carbon │  │ feeds.dlq    │  │
   │             │  │              │  │              │  │
   └──────┬──────┘  └──────┬───────┘  └──────────────┘
          │                │
          │                │
   ┌──────┴──────┐  ┌──────┴───────┐
   │  Logger     │  │  Aggregator  │
   │  Consumer   │  │  Consumer    │
   └─────────────┘  └──────────────┘
```

## Exchanges

### feeds.topic (Topic Exchange)

The primary exchange for all feed data. Uses topic routing to allow flexible message routing based on patterns.

| Property | Value |
|----------|-------|
| Name | `feeds.topic` |
| Type | `topic` |
| Durable | `true` |
| Auto-delete | `false` |

### feeds.dlx (Dead Letter Exchange)

Receives messages that fail processing after all retry attempts.

| Property | Value |
|----------|-------|
| Name | `feeds.dlx` |
| Type | `fanout` |
| Durable | `true` |
| Auto-delete | `false` |

## Queues

### feeds.all

Receives all messages regardless of source. Used by the logger consumer.

| Property | Value |
|----------|-------|
| Name | `feeds.all` |
| Durable | `true` |
| Binding | `feeds.topic` with routing key `feed.#` |
| Dead Letter Exchange | `feeds.dlx` |

### feeds.carbon

Receives only carbon intensity messages.

| Property | Value |
|----------|-------|
| Name | `feeds.carbon` |
| Durable | `true` |
| Binding | `feeds.topic` with routing key `feed.carbon.*` |
| Dead Letter Exchange | `feeds.dlx` |

### feeds.weather

Receives only weather messages.

| Property | Value |
|----------|-------|
| Name | `feeds.weather` |
| Durable | `true` |
| Binding | `feeds.topic` with routing key `feed.weather.*` |
| Dead Letter Exchange | `feeds.dlx` |

### feeds.dlq

Dead letter queue that collects failed messages for inspection.

| Property | Value |
|----------|-------|
| Name | `feeds.dlq` |
| Durable | `true` |
| Binding | `feeds.dlx` (all messages) |

## Routing Keys

Routing keys follow a hierarchical naming convention:

```
feed.<source>.<type>
```

| Routing Key | Description |
|-------------|-------------|
| `feed.carbon.intensity` | UK grid carbon intensity data |
| `feed.carbon.generation` | UK generation mix data |
| `feed.weather.current` | Current weather conditions |
| `feed.weather.forecast` | Weather forecast data |

### Routing Key Patterns

| Pattern | Matches | Use Case |
|---------|---------|----------|
| `feed.#` | All feed messages | Logger consumer |
| `feed.carbon.*` | All carbon messages | Carbon aggregator |
| `feed.weather.*` | All weather messages | Weather aggregator |
| `feed.*.current` | All "current" data | Real-time dashboard |

## Consumer Bindings

### Logger Consumer

- Queue: `feeds.all`
- Binding: `feed.#` (receives everything)
- Purpose: Log all messages for debugging/auditing
- Scaling: Single instance (no competing consumers)

### Carbon Aggregator Consumer

- Queue: `feeds.carbon`
- Binding: `feed.carbon.*`
- Purpose: Process and aggregate carbon data
- Scaling: Can run multiple competing consumers

### Weather Aggregator Consumer

- Queue: `feeds.weather`
- Binding: `feed.weather.*`
- Purpose: Process and aggregate weather data
- Scaling: Can run multiple competing consumers

## Message Flow

1. **Ingester** polls external API
2. **Ingester** publishes message to `feeds.topic` exchange with appropriate routing key
3. **Exchange** routes message to matching queues based on binding patterns
4. **Queue** stores message until consumer acknowledges
5. **Consumer** processes message and sends ack/nack
6. If nack with requeue=false after max retries, message goes to **DLQ**

## Connection Management

Each component maintains its own connection to RabbitMQ:

- **Ingesters**: Single connection, single channel for publishing
- **Consumers**: Single connection, channel per consumer with prefetch limit
- **Reconnection**: Automatic reconnection with exponential backoff on connection loss
