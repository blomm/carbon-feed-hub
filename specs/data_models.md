# Data Models

## Message Envelope

All messages published to RabbitMQ use a consistent envelope format. This enables uniform handling across consumers and supports features like idempotency and tracing.

### Envelope Structure

```
{
  "id": string,           // Unique message ID (UUID v4)
  "source": string,       // Origin system ("carbon-ingester", "weather-ingester")
  "type": string,         // Message type matching routing key
  "timestamp": string,    // ISO 8601 timestamp when message was created
  "data": object          // Payload specific to message type
}
```

### Envelope Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | UUID v4. Used for idempotency checks and deduplication |
| `source` | string | Identifier of the producing service |
| `type` | string | Message type, matches the routing key (e.g., `feed.carbon.intensity`) |
| `timestamp` | string | ISO 8601 UTC timestamp of message creation |
| `data` | object | The actual payload, structure varies by type |

---

## Carbon Intensity Message

Published with routing key: `feed.carbon.intensity`

### Data Payload

```
{
  "periodStart": string,      // ISO 8601
  "periodEnd": string,        // ISO 8601
  "forecast": number,         // gCO2/kWh
  "actual": number | null,    // gCO2/kWh, null if not yet available
  "index": string             // "very low" | "low" | "moderate" | "high" | "very high"
}
```

### Example Message

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "source": "carbon-ingester",
  "type": "feed.carbon.intensity",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "periodStart": "2024-01-15T10:00:00.000Z",
    "periodEnd": "2024-01-15T10:30:00.000Z",
    "forecast": 195,
    "actual": 192,
    "index": "moderate"
  }
}
```

---

## Carbon Generation Message

Published with routing key: `feed.carbon.generation`

### Data Payload

```
{
  "timestamp": string,        // ISO 8601
  "mix": [
    {
      "fuel": string,         // Fuel type
      "percentage": number    // 0-100
    }
  ]
}
```

### Fuel Types

- `gas` - Combined Cycle Gas Turbine
- `coal` - Coal
- `nuclear` - Nuclear
- `wind` - Wind (onshore + offshore)
- `solar` - Solar
- `hydro` - Hydro
- `imports` - Interconnector imports
- `biomass` - Biomass
- `other` - Other sources

### Example Message

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "source": "carbon-ingester",
  "type": "feed.carbon.generation",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "timestamp": "2024-01-15T10:30:00.000Z",
    "mix": [
      { "fuel": "gas", "percentage": 35.2 },
      { "fuel": "wind", "percentage": 28.1 },
      { "fuel": "nuclear", "percentage": 15.8 },
      { "fuel": "imports", "percentage": 8.4 },
      { "fuel": "solar", "percentage": 5.2 },
      { "fuel": "biomass", "percentage": 4.8 },
      { "fuel": "hydro", "percentage": 1.5 },
      { "fuel": "coal", "percentage": 0.8 },
      { "fuel": "other", "percentage": 0.2 }
    ]
  }
}
```

---

## Weather Current Message

Published with routing key: `feed.weather.current`

### Data Payload

```
{
  "location": {
    "city": string,
    "country": string,
    "coordinates": {
      "lat": number,
      "lon": number
    }
  },
  "observedAt": string,       // ISO 8601
  "temperature": {
    "current": number,        // Celsius
    "feelsLike": number       // Celsius
  },
  "humidity": number,         // Percentage (0-100)
  "pressure": number,         // hPa
  "wind": {
    "speed": number,          // m/s
    "direction": number       // Degrees (0-360)
  },
  "condition": {
    "main": string,           // Primary condition
    "description": string     // Detailed description
  }
}
```

### Example Message

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "source": "weather-ingester",
  "type": "feed.weather.current",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "location": {
      "city": "London",
      "country": "GB",
      "coordinates": { "lat": 51.5074, "lon": -0.1278 }
    },
    "observedAt": "2024-01-15T10:25:00.000Z",
    "temperature": {
      "current": 8.5,
      "feelsLike": 6.2
    },
    "humidity": 82,
    "pressure": 1015,
    "wind": {
      "speed": 4.2,
      "direction": 230
    },
    "condition": {
      "main": "Clouds",
      "description": "overcast clouds"
    }
  }
}
```

---

## Message Properties (AMQP)

In addition to the JSON body, messages include AMQP properties:

| Property | Value | Purpose |
|----------|-------|---------|
| `content_type` | `application/json` | Indicates JSON body |
| `content_encoding` | `utf-8` | Character encoding |
| `delivery_mode` | `2` (persistent) | Survives broker restart |
| `message_id` | Same as envelope `id` | AMQP-level deduplication |
| `timestamp` | Unix timestamp | AMQP-level timestamp |
| `app_id` | Same as envelope `source` | Identifies producer |

---

## Idempotency

The `id` field in the envelope enables idempotency:

1. Consumers should track processed message IDs
2. If a message ID has been seen before, skip processing
3. Use a time-bounded cache (e.g., last 1 hour of IDs) to limit memory
4. Message IDs follow UUID v4 format, generated by the ingester
