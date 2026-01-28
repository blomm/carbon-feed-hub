import 'dotenv/config';
import { getConnectionManager, Channel } from '../lib/connection';
import { setupTopology, EXCHANGES, ROUTING_KEYS } from '../lib/topology';
import {
  WeatherCurrentData,
  MessageEnvelope,
  MESSAGE_SOURCES,
  createWeatherCurrentMessage,
} from '../lib/messages';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  baseUrl: 'https://api.openweathermap.org/data/2.5',
  apiKey: process.env.OPENWEATHER_API_KEY,
  city: process.env.WEATHER_CITY || 'London,UK',
  pollInterval: parseInt(process.env.WEATHER_POLL_INTERVAL_MS || '600000', 10),
  baseRetryDelay: 10000,
  maxRetryDelay: 600000,
  rateLimitDelay: 60000,
};

// ============================================================================
// API Response Type
// ============================================================================

interface WeatherApiResponse {
  coord: {
    lat: number;
    lon: number;
  };
  weather: Array<{
    main: string;
    description: string;
  }>;
  main: {
    temp: number;
    feels_like: number;
    humidity: number;
    pressure: number;
  };
  wind: {
    speed: number;
    deg: number;
  };
  dt: number;
  name: string;
  sys: {
    country: string;
  };
}

// ============================================================================
// Custom Error for Rate Limiting
// ============================================================================

class RateLimitError extends Error {
  constructor() {
    super('Rate limit exceeded (429)');
    this.name = 'RateLimitError';
  }
}

// ============================================================================
// State
// ============================================================================

let channel: Channel | null = null;
let failures = 0;
let pollTimer: NodeJS.Timeout | null = null;
let isShuttingDown = false;

// ============================================================================
// HTTP Client
// ============================================================================

async function fetchWeather(): Promise<WeatherCurrentData> {
  const url = `${CONFIG.baseUrl}/weather?q=${encodeURIComponent(CONFIG.city)}&appid=${CONFIG.apiKey}&units=metric`;
  console.log(`[Weather] Fetching weather for ${CONFIG.city}`);

  const response = await fetch(url);

  if (response.status === 429) {
    throw new RateLimitError();
  }

  if (response.status === 401) {
    throw new Error('Invalid API key (401)');
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const json = (await response.json()) as WeatherApiResponse;

  return {
    location: {
      city: json.name,
      country: json.sys.country,
      coordinates: {
        lat: json.coord.lat,
        lon: json.coord.lon,
      },
    },
    observedAt: new Date(json.dt * 1000).toISOString(),
    temperature: {
      current: json.main.temp,
      feelsLike: json.main.feels_like,
    },
    humidity: json.main.humidity,
    pressure: json.main.pressure,
    wind: {
      speed: json.wind.speed,
      direction: json.wind.deg,
    },
    condition: {
      main: json.weather[0].main,
      description: json.weather[0].description,
    },
  };
}

// ============================================================================
// Message Publishing
// ============================================================================

async function publishMessage(
  message: MessageEnvelope,
  routingKey: string
): Promise<void> {
  if (!channel) {
    throw new Error('Channel not available');
  }

  const content = Buffer.from(JSON.stringify(message));

  channel.publish(EXCHANGES.TOPIC, routingKey, content, {
    contentType: 'application/json',
    contentEncoding: 'utf-8',
    deliveryMode: 2,
    messageId: message.id,
    timestamp: Math.floor(Date.now() / 1000),
    appId: MESSAGE_SOURCES.WEATHER_INGESTER,
  });

  console.log(`[Weather] Published message ${message.id} to ${routingKey}`);
}

// ============================================================================
// Exponential Backoff
// ============================================================================

function calculateBackoff(failureCount: number): number {
  const delay = CONFIG.baseRetryDelay * Math.pow(2, failureCount);
  return Math.min(delay, CONFIG.maxRetryDelay);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Polling Function
// ============================================================================

async function pollWeather(): Promise<void> {
  if (isShuttingDown) return;

  try {
    const data = await fetchWeather();
    const message = createWeatherCurrentMessage(data);
    await publishMessage(message, ROUTING_KEYS.WEATHER_CURRENT);

    console.log(
      `[Weather] ${data.location.city}: ${data.temperature.current}°C, ${data.condition.description}`
    );

    failures = 0;
  } catch (error) {
    if (error instanceof RateLimitError) {
      console.warn(`[Weather] Rate limited, waiting ${CONFIG.rateLimitDelay}ms`);
      await sleep(CONFIG.rateLimitDelay);
      if (!isShuttingDown) {
        pollWeather();
      }
      return;
    }

    failures++;
    const backoff = calculateBackoff(failures);
    console.error(
      `[Weather] Fetch failed (attempt ${failures}):`,
      (error as Error).message
    );
    console.log(`[Weather] Next retry in ${backoff}ms`);

    await sleep(backoff);
    if (!isShuttingDown) {
      pollWeather();
    }
    return;
  }

  if (!isShuttingDown) {
    pollTimer = setTimeout(pollWeather, CONFIG.pollInterval);
  }
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function shutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('\n[Weather] Shutting down...');

  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }

  const manager = getConnectionManager();
  await manager.close();

  console.log('[Weather] Shutdown complete');
  process.exit(0);
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  // Validate API key exists
  if (!CONFIG.apiKey) {
    console.error('[Weather] ERROR: OPENWEATHER_API_KEY environment variable is required');
    console.error('[Weather] Get a free API key at https://openweathermap.org/api');
    process.exit(1);
  }

  console.log('[Weather] Starting Weather Ingester...');
  console.log(`[Weather] City: ${CONFIG.city}`);
  console.log(`[Weather] Poll interval: ${CONFIG.pollInterval}ms`);

  // Register shutdown handlers
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Connect to RabbitMQ
  const manager = getConnectionManager();
  channel = await manager.getChannel();

  // Ensure topology exists
  await setupTopology(channel);

  console.log('[Weather] Connected to RabbitMQ, starting polling...');

  // Start polling immediately
  pollWeather();
}

main().catch((error) => {
  console.error('[Weather] Fatal error:', error.message);
  process.exit(1);
});
