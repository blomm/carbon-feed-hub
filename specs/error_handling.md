# Error Handling

## Error Categories

### Transient Errors

Temporary failures that may succeed on retry.

**Examples:**
- Network timeout
- External API temporarily unavailable
- Database connection dropped
- Resource temporarily exhausted

**Strategy:** Retry with exponential backoff.

### Permanent Errors

Failures that will not succeed regardless of retries.

**Examples:**
- Invalid message format (malformed JSON)
- Business rule violation
- Missing required data
- Authentication failure (bad API key)

**Strategy:** Send to dead letter queue, alert, do not retry.

### Poison Messages

Messages that consistently cause consumer crashes or errors.

**Examples:**
- Message triggers unhandled exception
- Processing causes out-of-memory
- Infinite loop in processing logic

**Strategy:** Detect via retry count, send to DLQ after max retries.

---

## Retry Strategy

### Exponential Backoff

Delays between retries increase exponentially to avoid overwhelming a failing system.

**Formula:**
```
delay = min(baseDelay * 2^attempt, maxDelay) + jitter
```

**Parameters:**
| Parameter | Value | Purpose |
|-----------|-------|---------|
| baseDelay | 1 second | Initial delay |
| maxDelay | 60 seconds | Cap to prevent excessive waits |
| maxAttempts | 3 | Total retry attempts before DLQ |
| jitter | 0-500ms random | Prevents thundering herd |

### Retry Attempts

```
Attempt 1: Immediate (original delivery)
Attempt 2: ~1 second delay
Attempt 3: ~2 seconds delay
Attempt 4: → Dead Letter Queue
```

### Tracking Retry Count

RabbitMQ doesn't natively track retry count. Options:

1. **Message headers:** Add `x-retry-count` header, increment on each requeue
2. **External store:** Track message IDs and attempt counts in Redis/memory
3. **Dead letter headers:** Check `x-death` header added by DLX

This project uses the message header approach:
- On first delivery, no `x-retry-count` header exists
- On nack with requeue, increment header
- On max retries exceeded, nack without requeue (goes to DLQ)

---

## Dead Letter Queues

### What Is a DLQ?

A dead letter queue collects messages that could not be processed successfully. It provides:
- Visibility into failures
- Ability to inspect and debug
- Option to replay messages after fixing issues

### When Messages Go to DLQ

1. Consumer nacks without requeue
2. Message TTL expires
3. Queue length limit exceeded
4. Message rejected

### DLQ Configuration

Each queue is configured with a dead letter exchange:

```
Queue arguments:
  x-dead-letter-exchange: feeds.dlx
  x-dead-letter-routing-key: (optional, preserves original if omitted)
```

### DLQ Headers

When a message is dead-lettered, RabbitMQ adds the `x-death` header containing:
- `queue` - Original queue name
- `reason` - Why it was dead-lettered (rejected, expired, maxlen)
- `time` - When it was dead-lettered
- `count` - How many times dead-lettered (for repeated failures)
- `original-routing-key` - Original routing key

### Handling DLQ Messages

Options for processing DLQ messages:

1. **Manual inspection:** Use RabbitMQ Management UI to view and delete
2. **Alerting:** Monitor DLQ depth, alert when messages appear
3. **Replay:** After fixing the issue, republish messages to original exchange
4. **Archive:** Move to long-term storage for analysis

---

## Idempotency

### Why Idempotency Matters

Messages may be delivered more than once due to:
- Consumer crash after processing but before ack
- Network issues causing ack to be lost
- Redelivery after timeout

Processing must be safe to repeat without side effects.

### Idempotency Strategies

#### 1. Idempotency Key

Use the message `id` field to track processed messages.

**Implementation:**
1. Before processing, check if message ID exists in processed set
2. If exists, ack immediately and skip processing
3. If not exists, process message, add ID to set, then ack

**Storage options:**
- In-memory Set (lost on restart, but messages redeliver)
- Redis with TTL
- Database table

#### 2. Natural Idempotency

Design operations to be naturally idempotent.

**Examples:**
- SET operations instead of INCREMENT
- UPSERT instead of INSERT
- Timestamp-based deduplication (ignore older data)

#### 3. Optimistic Locking

For database operations, use version numbers or timestamps to prevent duplicate writes.

---

## Connection Failures

### Handling Broker Disconnection

The AMQP connection to RabbitMQ may drop due to:
- Network issues
- Broker restart
- Idle timeout

### Reconnection Strategy

1. Detect connection close event
2. Wait with exponential backoff
3. Attempt reconnection
4. Recreate channels and consumers
5. Resume processing

**Backoff for reconnection:**
- Start: 1 second
- Max: 30 seconds
- Jitter: Yes

### Channel Errors

Channels can fail independently of connections. Common causes:
- Publishing to non-existent exchange
- Consuming from non-existent queue
- Access control violation

**Strategy:** Close and recreate the channel, or recreate the entire connection.

---

## Ingester Error Handling

### External API Failures

When the Carbon or Weather API fails:

1. Log the error with details
2. Apply exponential backoff before next poll
3. Continue polling on schedule (don't block on failure)
4. Alert if failures exceed threshold (e.g., 5 consecutive failures)

### Publishing Failures

If publishing to RabbitMQ fails:

1. Store message in local buffer (limited size)
2. Attempt reconnection
3. Republish buffered messages on reconnection
4. Drop oldest messages if buffer full (log dropped count)

---

## Consumer Error Handling

### Processing Errors

```
try {
  process(message)
  ack(message)
} catch (error) {
  if (isTransient(error) && retryCount < maxRetries) {
    incrementRetryHeader(message)
    nack(message, requeue: true)
  } else {
    log(error, message)
    nack(message, requeue: false)  // Goes to DLQ
  }
}
```

### Unhandled Exceptions

Wrap all consumer logic in try-catch to prevent crashes. Unhandled exceptions should:
1. Log the error
2. Nack the message without requeue
3. Continue processing other messages

---

## Monitoring and Alerting

### Key Metrics to Monitor

| Metric | Alert Threshold | Meaning |
|--------|-----------------|---------|
| DLQ depth | > 0 | Messages are failing |
| Queue depth | > 1000 | Consumers can't keep up |
| Consumer count | = 0 | No consumers running |
| Unacked messages | > 100 | Messages stuck in processing |
| Connection count | = 0 | Lost connection to broker |

### Logging

Log these events:
- Message processing errors (with message ID)
- Retries (with attempt number)
- Dead letter events
- Connection state changes
- External API failures
