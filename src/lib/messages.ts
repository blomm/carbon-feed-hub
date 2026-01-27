import { randomUUID } from 'crypto';

// ============================================================================
// Message Envelope
// ============================================================================

/**
 * Generic message envelope that wraps all messages published to RabbitMQ.
 * Enables uniform handling across consumers and supports idempotency/tracing.
 */
export interface MessageEnvelope<T = unknown> {
  /** Unique message ID (UUID v4) - used for idempotency checks */
  id: string;
  /** Origin system identifier (e.g., "carbon-ingester", "weather-ingester") */
  source: string;
  /** Message type matching routing key (e.g., "feed.carbon.intensity") */
  type: string;
  /** ISO 8601 timestamp when message was created */
  timestamp: string;
  /** Payload specific to message type */
  data: T;
}

// ============================================================================
// Carbon Intensity Message
// ============================================================================

/** Carbon intensity index levels */
export type CarbonIntensityIndex =
  | 'very low'
  | 'low'
  | 'moderate'
  | 'high'
  | 'very high';

/** Data payload for carbon intensity messages (routing key: feed.carbon.intensity) */
export interface CarbonIntensityData {
  /** Period start time (ISO 8601) */
  periodStart: string;
  /** Period end time (ISO 8601) */
  periodEnd: string;
  /** Forecast carbon intensity in gCO2/kWh */
  forecast: number;
  /** Actual carbon intensity in gCO2/kWh, null if not yet available */
  actual: number | null;
  /** Human-readable intensity index */
  index: CarbonIntensityIndex;
}

/** Full carbon intensity message with envelope */
export type CarbonIntensityMessage = MessageEnvelope<CarbonIntensityData>;

// ============================================================================
// Carbon Generation Message
// ============================================================================

/** Fuel types used in UK generation mix */
export type FuelType =
  | 'gas'
  | 'coal'
  | 'nuclear'
  | 'wind'
  | 'solar'
  | 'hydro'
  | 'imports'
  | 'biomass'
  | 'other';

/** A single fuel source contribution to the generation mix */
export interface GenerationMixEntry {
  /** Fuel type */
  fuel: FuelType;
  /** Percentage of total generation (0-100) */
  percentage: number;
}

/** Data payload for carbon generation messages (routing key: feed.carbon.generation) */
export interface CarbonGenerationData {
  /** Timestamp of the generation mix snapshot (ISO 8601) */
  timestamp: string;
  /** Array of fuel contributions */
  mix: GenerationMixEntry[];
}

/** Full carbon generation message with envelope */
export type CarbonGenerationMessage = MessageEnvelope<CarbonGenerationData>;

// ============================================================================
// Weather Current Message
// ============================================================================

/** Geographic coordinates */
export interface Coordinates {
  lat: number;
  lon: number;
}

/** Location information */
export interface WeatherLocation {
  city: string;
  country: string;
  coordinates: Coordinates;
}

/** Temperature readings */
export interface Temperature {
  /** Current temperature in Celsius */
  current: number;
  /** Feels-like temperature in Celsius */
  feelsLike: number;
}

/** Wind conditions */
export interface Wind {
  /** Wind speed in m/s */
  speed: number;
  /** Wind direction in degrees (0-360) */
  direction: number;
}

/** Weather condition description */
export interface WeatherCondition {
  /** Primary condition (e.g., "Clouds", "Rain") */
  main: string;
  /** Detailed description (e.g., "overcast clouds") */
  description: string;
}

/** Data payload for weather current messages (routing key: feed.weather.current) */
export interface WeatherCurrentData {
  location: WeatherLocation;
  /** Time of observation (ISO 8601) */
  observedAt: string;
  temperature: Temperature;
  /** Humidity percentage (0-100) */
  humidity: number;
  /** Atmospheric pressure in hPa */
  pressure: number;
  wind: Wind;
  condition: WeatherCondition;
}

/** Full weather current message with envelope */
export type WeatherCurrentMessage = MessageEnvelope<WeatherCurrentData>;

// ============================================================================
// Message Sources and Types
// ============================================================================

/** Known message sources */
export const MESSAGE_SOURCES = {
  CARBON_INGESTER: 'carbon-ingester',
  WEATHER_INGESTER: 'weather-ingester',
} as const;

export type MessageSource = (typeof MESSAGE_SOURCES)[keyof typeof MESSAGE_SOURCES];

/** Known message types (matching routing keys) */
export const MESSAGE_TYPES = {
  CARBON_INTENSITY: 'feed.carbon.intensity',
  CARBON_GENERATION: 'feed.carbon.generation',
  WEATHER_CURRENT: 'feed.weather.current',
} as const;

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];

// ============================================================================
// Envelope Factory
// ============================================================================

export interface CreateEnvelopeOptions<T> {
  source: MessageSource;
  type: MessageType;
  data: T;
}

/**
 * Creates a message envelope with auto-generated ID and timestamp.
 */
export function createEnvelope<T>(options: CreateEnvelopeOptions<T>): MessageEnvelope<T> {
  return {
    id: randomUUID(),
    source: options.source,
    type: options.type,
    timestamp: new Date().toISOString(),
    data: options.data,
  };
}

/**
 * Creates a carbon intensity message envelope.
 */
export function createCarbonIntensityMessage(
  data: CarbonIntensityData
): CarbonIntensityMessage {
  return createEnvelope({
    source: MESSAGE_SOURCES.CARBON_INGESTER,
    type: MESSAGE_TYPES.CARBON_INTENSITY,
    data,
  });
}

/**
 * Creates a carbon generation message envelope.
 */
export function createCarbonGenerationMessage(
  data: CarbonGenerationData
): CarbonGenerationMessage {
  return createEnvelope({
    source: MESSAGE_SOURCES.CARBON_INGESTER,
    type: MESSAGE_TYPES.CARBON_GENERATION,
    data,
  });
}

/**
 * Creates a weather current message envelope.
 */
export function createWeatherCurrentMessage(
  data: WeatherCurrentData
): WeatherCurrentMessage {
  return createEnvelope({
    source: MESSAGE_SOURCES.WEATHER_INGESTER,
    type: MESSAGE_TYPES.WEATHER_CURRENT,
    data,
  });
}
