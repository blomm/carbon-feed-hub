# Data Sources

## UK Carbon Intensity API

The National Grid ESO provides a free API for UK electricity carbon intensity data.

### Overview

| Property | Value |
|----------|-------|
| Base URL | `https://api.carbonintensity.org.uk` |
| Authentication | None required |
| Rate Limit | No documented limit (be respectful) |
| Data Update Frequency | Every 30 minutes |
| Recommended Poll Interval | 30 seconds to 5 minutes |

### Endpoints

#### Current Intensity

Returns the current carbon intensity for the UK grid.

```
GET /intensity
```

Response structure:
- `data[0].from` - Period start time (ISO 8601)
- `data[0].to` - Period end time (ISO 8601)
- `data[0].intensity.forecast` - Forecasted intensity (gCO2/kWh)
- `data[0].intensity.actual` - Actual intensity (gCO2/kWh, may be null)
- `data[0].intensity.index` - Intensity category (very low, low, moderate, high, very high)

#### Generation Mix

Returns the current generation mix by fuel type.

```
GET /generation
```

Response structure:
- `data.generationmix[]` - Array of generation sources
- `data.generationmix[].fuel` - Fuel type (gas, coal, nuclear, wind, solar, etc.)
- `data.generationmix[].perc` - Percentage of total generation

#### Regional Data

Returns intensity data for specific regions.

```
GET /regional
```

Response includes data for 17 UK regions with individual intensity values.

### Error Responses

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 400 | Bad request (invalid parameters) |
| 500 | Server error |

---

## OpenWeather API

OpenWeather provides weather data requiring a free API key.

### Overview

| Property | Value |
|----------|-------|
| Base URL | `https://api.openweathermap.org/data/2.5` |
| Authentication | API key (query parameter `appid`) |
| Rate Limit | 60 calls/minute (free tier) |
| Recommended Poll Interval | 5 to 15 minutes |

### Getting an API Key

1. Register at https://openweathermap.org/api
2. Generate a free API key
3. Store the key in environment variable `OPENWEATHER_API_KEY`

### Endpoints

#### Current Weather

Returns current weather conditions for a location.

```
GET /weather?q={city}&appid={API_KEY}&units=metric
```

Parameters:
- `q` - City name (e.g., "London,UK")
- `appid` - Your API key
- `units` - Temperature units (metric, imperial, standard)

Response structure:
- `main.temp` - Current temperature
- `main.humidity` - Humidity percentage
- `main.pressure` - Atmospheric pressure (hPa)
- `wind.speed` - Wind speed (m/s with metric units)
- `wind.deg` - Wind direction (degrees)
- `weather[0].main` - Weather condition (Rain, Clear, Clouds, etc.)
- `weather[0].description` - Detailed description
- `dt` - Data calculation time (Unix timestamp)

#### 5-Day Forecast

Returns 5-day forecast with 3-hour intervals.

```
GET /forecast?q={city}&appid={API_KEY}&units=metric
```

Response structure:
- `list[]` - Array of forecast entries
- `list[].dt` - Forecast time (Unix timestamp)
- `list[].main` - Temperature, humidity, pressure
- `list[].weather` - Weather conditions
- `list[].wind` - Wind data

### Error Responses

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 401 | Invalid API key |
| 404 | City not found |
| 429 | Rate limit exceeded |
| 500 | Server error |

---

## Polling Strategy

### Carbon Intensity Ingester

- Poll `/intensity` every 2 minutes
- Poll `/generation` every 5 minutes
- On error: Exponential backoff starting at 5 seconds, max 5 minutes

### Weather Ingester

- Poll `/weather` every 10 minutes
- Default location: London, UK (configurable)
- On error: Exponential backoff starting at 10 seconds, max 10 minutes
- On 429 (rate limit): Wait 60 seconds before retry

### Backoff Formula

```
delay = min(baseDelay * 2^attempt, maxDelay)
```

Where:
- `baseDelay` = Initial delay (5s for carbon, 10s for weather)
- `attempt` = Number of consecutive failures
- `maxDelay` = Maximum delay cap
