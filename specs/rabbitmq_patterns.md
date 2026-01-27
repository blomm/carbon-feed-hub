# RabbitMQ Patterns

This document explains the core RabbitMQ concepts used in this project.

## Exchanges vs Queues

### Exchanges

An exchange is a routing mechanism. Producers never send messages directly to queues—they publish to exchanges, which then route messages to queues based on rules.

**Key characteristics:**
- Receives messages from producers
- Routes messages to zero or more queues based on bindings
- Does not store messages (passes them through immediately)
- Different exchange types provide different routing logic

### Queues

A queue is a buffer that stores messages until consumers process them.

**Key characteristics:**
- Stores messages in order (FIFO by default)
- Delivers messages to consumers
- Tracks which messages have been acknowledged
- Can be durable (survives broker restart) or transient

### The Relationship

```
Producer → Exchange → Binding → Queue → Consumer
```

1. Producer publishes message to exchange with a routing key
2. Exchange evaluates bindings to determine which queues match
3. Message is copied to each matching queue
4. Queue stores message until consumer acknowledges it

---

## Exchange Types

### Direct Exchange

Routes messages to queues where the binding key exactly matches the routing key.

**Use case:** Point-to-point messaging, task distribution.

### Topic Exchange (Used in this project)

Routes messages based on pattern matching between routing key and binding key.

**Pattern syntax:**
- `*` matches exactly one word
- `#` matches zero or more words
- Words are separated by dots

**Examples:**
- Routing key: `feed.carbon.intensity`
- Binding `feed.carbon.*` → Matches
- Binding `feed.#` → Matches
- Binding `feed.weather.*` → Does not match

**Use case:** Pub/sub with selective filtering.

### Fanout Exchange

Routes messages to all bound queues regardless of routing key.

**Use case:** Broadcasting to all consumers, dead letter exchanges.

### Headers Exchange

Routes based on message header attributes instead of routing key.

**Use case:** Complex routing logic based on multiple attributes.

---

## Routing Keys

A routing key is a string attached to each message that exchanges use for routing decisions.

### Naming Convention

This project uses a hierarchical dot-separated format:

```
<domain>.<source>.<type>
```

Examples:
- `feed.carbon.intensity` - Carbon intensity data
- `feed.carbon.generation` - Generation mix data
- `feed.weather.current` - Current weather
- `feed.weather.forecast` - Weather forecast

### Benefits

- **Selective consumption:** Consumers bind only to relevant messages
- **Fan-out:** Multiple queues can receive the same message
- **Filtering:** Topic patterns enable flexible subscription

---

## Consumer Acknowledgments

### Manual Acknowledgment Mode

Consumers must explicitly acknowledge messages. This project uses manual ack for reliability.

### Ack (Acknowledge)

Tells RabbitMQ the message was successfully processed and can be removed from the queue.

**When to ack:**
- Processing completed successfully
- Message was intentionally skipped (e.g., duplicate)

### Nack (Negative Acknowledge)

Tells RabbitMQ the message was not successfully processed.

**Options:**
- `requeue: true` - Return message to queue for another attempt
- `requeue: false` - Discard message (or send to DLX if configured)

**When to nack with requeue:**
- Temporary failure (network issue, resource unavailable)
- Only if retry might succeed

**When to nack without requeue:**
- Permanent failure (invalid message, business rule violation)
- Max retries exceeded

### Reject

Similar to nack but for a single message. Nack can handle multiple messages.

---

## Prefetch (QoS)

Prefetch limits how many unacknowledged messages a consumer can have at once.

### Why It Matters

Without prefetch, RabbitMQ pushes all messages to consumers immediately. This can:
- Overwhelm slow consumers
- Cause unfair distribution among consumers
- Lead to memory issues

### Recommended Settings

| Consumer Type | Prefetch | Reasoning |
|--------------|----------|-----------|
| Fast, simple processing | 10-20 | Higher throughput |
| Slow, CPU-intensive | 1-5 | Prevents overload |
| Mixed workload | 5-10 | Balance |

This project uses `prefetch: 10` for most consumers.

### Setting Prefetch

Prefetch is set at the channel level, not the connection level. Each channel can have its own prefetch value.

---

## Horizontal Scaling

### Competing Consumers

Multiple consumers can bind to the same queue. RabbitMQ distributes messages among them.

```
          ┌─────────────┐
          │             │
Queue ────┼─→ Consumer 1│
          │             │
          ├─→ Consumer 2│
          │             │
          └─→ Consumer 3│
```

**Behavior:**
- Messages are distributed round-robin by default
- Each message goes to exactly one consumer
- If a consumer doesn't ack, message goes to another consumer

### When to Scale

- Queue depth growing faster than consumption
- Consumer CPU consistently high
- Processing latency increasing

### Considerations

- Ensure processing is idempotent (message might be redelivered)
- Order is not guaranteed across consumers
- Use prefetch to ensure fair distribution

---

## Message Persistence

### Durable Queues

Queue definition survives broker restart, but messages may be lost unless also persistent.

### Persistent Messages

Messages marked with `delivery_mode: 2` are written to disk.

**Trade-offs:**
- Slower than transient messages
- Provides durability guarantee
- Required for reliable messaging

This project uses both durable queues and persistent messages.

---

## Bindings

A binding is a link between an exchange and a queue with an optional binding key.

### Creating Bindings

Bindings are typically created when declaring queues:

1. Declare the exchange
2. Declare the queue
3. Bind the queue to the exchange with a binding key

### Multiple Bindings

A queue can have multiple bindings to:
- The same exchange with different binding keys
- Different exchanges

### Binding Patterns (Topic Exchange)

| Binding Key | Matches |
|-------------|---------|
| `feed.carbon.intensity` | Only exact match |
| `feed.carbon.*` | `feed.carbon.intensity`, `feed.carbon.generation` |
| `feed.*.intensity` | `feed.carbon.intensity`, `feed.weather.intensity` |
| `feed.#` | All messages starting with `feed.` |
| `#` | All messages |
