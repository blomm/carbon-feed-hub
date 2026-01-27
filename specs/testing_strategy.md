# Testing Strategy

## Local Development Setup

### RabbitMQ with Docker

Run RabbitMQ locally using Docker with the management plugin for visibility.

**Docker command:**
```
docker run -d \
  --name rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  rabbitmq:3-management
```

**Ports:**
- `5672` - AMQP protocol (for your application)
- `15672` - Management UI (browser)

**Management UI:**
- URL: http://localhost:15672
- Default credentials: guest / guest

### Docker Compose (Recommended)

For easier management, use a docker-compose.yml:

```yaml
version: '3.8'
services:
  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq

volumes:
  rabbitmq_data:
```

### Environment Variables

Create a `.env` file for local development:

```
RABBITMQ_URL=amqp://guest:guest@localhost:5672
OPENWEATHER_API_KEY=your_api_key_here
CARBON_POLL_INTERVAL_MS=120000
WEATHER_POLL_INTERVAL_MS=600000
```

---

## Testing Levels

### Unit Tests

Test individual functions in isolation without RabbitMQ.

**What to test:**
- Message envelope creation and validation
- Data transformation (API response → internal format)
- Retry count logic
- Idempotency key generation
- Routing key construction

**Mock:**
- AMQP channel methods (publish, ack, nack)
- External API responses

### Integration Tests

Test components with a real RabbitMQ instance.

**What to test:**
- Message publishing and routing
- Queue bindings work correctly
- Consumer receives and acknowledges messages
- Dead letter routing works
- Prefetch limits are respected

**Setup:**
- Use Docker RabbitMQ
- Create fresh queues/exchanges per test
- Clean up after each test

### End-to-End Tests

Test the complete flow from ingestion to consumption.

**What to test:**
- Ingester fetches real data and publishes
- Messages route to correct queues
- Consumers process messages correctly
- DLQ receives failed messages
- System recovers from broker restart

---

## Testing Scenarios

### Happy Path

1. Start RabbitMQ
2. Start consumers
3. Start ingesters
4. Verify messages appear in RabbitMQ Management UI
5. Verify consumers log received messages
6. Check queue depths stay near zero (messages consumed)

### Consumer Failure

1. Start system normally
2. Stop a consumer
3. Verify messages queue up
4. Restart consumer
5. Verify queued messages are processed

### Broker Restart

1. Start system with messages flowing
2. Restart RabbitMQ container
3. Verify ingesters reconnect
4. Verify consumers reconnect
5. Verify message flow resumes
6. Check no messages were lost (durable queues + persistent messages)

### Network Partition (Simulated)

1. Start system normally
2. Use `docker network disconnect` to isolate RabbitMQ
3. Verify ingesters buffer messages locally
4. Reconnect network
5. Verify buffered messages are published

### Poison Message

1. Publish a malformed message directly to queue
2. Verify consumer nacks after max retries
3. Verify message appears in DLQ
4. Inspect DLQ message headers for failure info

### Rate Limiting

1. Configure prefetch to 1
2. Add artificial delay in consumer processing
3. Verify queue depth grows when publish rate > consume rate
4. Verify messages are processed in order

---

## Manual Testing with RabbitMQ Management

### Publishing Test Messages

Use the Management UI to publish test messages:

1. Go to Queues → select a queue
2. Click "Publish message"
3. Enter routing key and payload
4. Click "Publish message"

### Inspecting Queues

1. Go to Queues tab
2. View message counts: Ready, Unacked, Total
3. Click "Get messages" to peek at queue contents
4. Use "Ack mode: Reject requeue false" to simulate DLQ

### Viewing Bindings

1. Go to Exchanges tab
2. Select an exchange
3. View all bindings and routing patterns

### Monitoring Connections

1. Go to Connections tab
2. View active connections from ingesters and consumers
3. Check connection state and channel count

---

## Testing Tools

### RabbitMQ CLI (rabbitmqctl)

Access the CLI inside the Docker container:

```
docker exec -it rabbitmq rabbitmqctl <command>
```

**Useful commands:**
- `list_queues name messages` - Show queue depths
- `list_exchanges name type` - Show exchanges
- `list_bindings` - Show all bindings
- `purge_queue <queue_name>` - Clear a queue

### RabbitMQ Admin CLI (rabbitmqadmin)

More user-friendly CLI for testing:

```
docker exec -it rabbitmq rabbitmqadmin list queues
docker exec -it rabbitmq rabbitmqadmin publish exchange=feeds.topic routing_key=feed.carbon.intensity payload='{"test":true}'
```

---

## Test Data

### Mock Carbon API Response

```json
{
  "data": [{
    "from": "2024-01-15T10:00Z",
    "to": "2024-01-15T10:30Z",
    "intensity": {
      "forecast": 195,
      "actual": 192,
      "index": "moderate"
    }
  }]
}
```

### Mock Weather API Response

```json
{
  "coord": { "lon": -0.1278, "lat": 51.5074 },
  "weather": [{ "main": "Clouds", "description": "overcast clouds" }],
  "main": {
    "temp": 8.5,
    "feels_like": 6.2,
    "humidity": 82,
    "pressure": 1015
  },
  "wind": { "speed": 4.2, "deg": 230 },
  "dt": 1705315500,
  "name": "London"
}
```

---

## Continuous Integration

### CI Pipeline Steps

1. **Lint** - Check code style
2. **Unit tests** - Run without external dependencies
3. **Start RabbitMQ** - Use service container
4. **Integration tests** - Run with RabbitMQ
5. **Stop RabbitMQ** - Clean up

### GitHub Actions Example

```yaml
services:
  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - 5672:5672
    options: >-
      --health-cmd "rabbitmqctl status"
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
```

---

## Debugging Tips

### Message Not Routing

1. Check exchange exists
2. Check binding key matches routing key
3. Verify exchange type (topic vs direct vs fanout)
4. Use Management UI to trace message path

### Messages Stuck in Queue

1. Check consumer is connected
2. Verify consumer is subscribed to correct queue
3. Check for unacked messages (consumer may be stuck)
4. Review prefetch settings

### Messages Going to DLQ

1. Check consumer logs for errors
2. Inspect message in DLQ for x-death header
3. Verify message format matches expected schema
4. Check retry count header

### Consumer Not Receiving

1. Verify queue name is correct
2. Check consumer acknowledgment mode
3. Ensure channel is not closed
4. Review connection state in Management UI
