import 'dotenv/config';
import { getConnectionManager, Channel } from '../lib/connection';
import { setupTopology, EXCHANGES, ROUTING_KEYS } from '../lib/topology';
import {
  CarbonIntensityData,
  CarbonGenerationData,
  CarbonIntensityIndex,
  FuelType,
  MessageEnvelope,
  MESSAGE_SOURCES,
  createCarbonIntensityMessage,
  createCarbonGenerationMessage,
} from '../lib/messages';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  baseUrl: 'https://api.carbonintensity.org.uk',
  intensityPollInterval: parseInt(process.env.CARBON_INTENSITY_POLL_INTERVAL_MS || '120000', 10),
  generationPollInterval: parseInt(process.env.CARBON_GENERATION_POLL_INTERVAL_MS || '300000', 10),
  baseRetryDelay: 5000,
  maxRetryDelay: 300000,
};

// ============================================================================
// API Response Types
// ============================================================================

interface IntensityApiResponse {
  data: Array<{
    from: string;
    to: string;
    intensity: {
      forecast: number;
      actual: number | null;
      index: string;
    };
  }>;
}

interface GenerationApiResponse {
  data: {
    generationmix: Array<{
      fuel: string;
      perc: number;
    }>;
  };
}

// ============================================================================
// State
// ============================================================================

let channel: Channel | null = null;
let intensityFailures = 0;
let generationFailures = 0;
let intensityTimer: NodeJS.Timeout | null = null;
let generationTimer: NodeJS.Timeout | null = null;
let isShuttingDown = false;

// ============================================================================
// HTTP Client
// ============================================================================

async function fetchIntensity(): Promise<CarbonIntensityData> {
  const url = `${CONFIG.baseUrl}/intensity`;
  console.log(`[Carbon] Fetching intensity from ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const json = (await response.json()) as IntensityApiResponse;
  const entry = json.data[0];

  return {
    periodStart: entry.from,
    periodEnd: entry.to,
    forecast: entry.intensity.forecast,
    actual: entry.intensity.actual,
    index: entry.intensity.index as CarbonIntensityIndex,
  };
}

async function fetchGeneration(): Promise<CarbonGenerationData> {
  const url = `${CONFIG.baseUrl}/generation`;
  console.log(`[Carbon] Fetching generation from ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const json = (await response.json()) as GenerationApiResponse;

  return {
    timestamp: new Date().toISOString(),
    mix: json.data.generationmix.map((entry) => ({
      fuel: entry.fuel as FuelType,
      percentage: entry.perc,
    })),
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
    deliveryMode: 2, // persistent
    messageId: message.id,
    timestamp: Math.floor(Date.now() / 1000),
    appId: MESSAGE_SOURCES.CARBON_INGESTER,
  });

  console.log(`[Carbon] Published message ${message.id} to ${routingKey}`);
}

// ============================================================================
// Exponential Backoff
// ============================================================================

function calculateBackoff(failures: number): number {
  const delay = CONFIG.baseRetryDelay * Math.pow(2, failures);
  return Math.min(delay, CONFIG.maxRetryDelay);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Polling Functions
// ============================================================================

async function pollIntensity(): Promise<void> {
  if (isShuttingDown) return;

  try {
    const data = await fetchIntensity();
    const message = createCarbonIntensityMessage(data);
    await publishMessage(message, ROUTING_KEYS.CARBON_INTENSITY);

    console.log(
      `[Carbon] Intensity: ${data.forecast} gCO2/kWh (${data.index}), actual: ${data.actual ?? 'pending'}`
    );

    intensityFailures = 0;
  } catch (error) {
    intensityFailures++;
    const backoff = calculateBackoff(intensityFailures);
    console.error(
      `[Carbon] Intensity fetch failed (attempt ${intensityFailures}):`,
      (error as Error).message
    );
    console.log(`[Carbon] Next intensity retry in ${backoff}ms`);

    await sleep(backoff);
    if (!isShuttingDown) {
      pollIntensity();
    }
    return;
  }

  if (!isShuttingDown) {
    intensityTimer = setTimeout(pollIntensity, CONFIG.intensityPollInterval);
  }
}

async function pollGeneration(): Promise<void> {
  if (isShuttingDown) return;

  try {
    const data = await fetchGeneration();
    const message = createCarbonGenerationMessage(data);
    await publishMessage(message, ROUTING_KEYS.CARBON_GENERATION);

    const topSources = data.mix
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 3)
      .map((s) => `${s.fuel}: ${s.percentage.toFixed(1)}%`)
      .join(', ');
    console.log(`[Carbon] Generation mix - Top 3: ${topSources}`);

    generationFailures = 0;
  } catch (error) {
    generationFailures++;
    const backoff = calculateBackoff(generationFailures);
    console.error(
      `[Carbon] Generation fetch failed (attempt ${generationFailures}):`,
      (error as Error).message
    );
    console.log(`[Carbon] Next generation retry in ${backoff}ms`);

    await sleep(backoff);
    if (!isShuttingDown) {
      pollGeneration();
    }
    return;
  }

  if (!isShuttingDown) {
    generationTimer = setTimeout(pollGeneration, CONFIG.generationPollInterval);
  }
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function shutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('\n[Carbon] Shutting down...');

  if (intensityTimer) {
    clearTimeout(intensityTimer);
    intensityTimer = null;
  }
  if (generationTimer) {
    clearTimeout(generationTimer);
    generationTimer = null;
  }

  const manager = getConnectionManager();
  await manager.close();

  console.log('[Carbon] Shutdown complete');
  process.exit(0);
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  console.log('[Carbon] Starting Carbon Intensity Ingester...');
  console.log(`[Carbon] Intensity poll interval: ${CONFIG.intensityPollInterval}ms`);
  console.log(`[Carbon] Generation poll interval: ${CONFIG.generationPollInterval}ms`);

  // Register shutdown handlers
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Connect to RabbitMQ
  const manager = getConnectionManager();
  channel = await manager.getChannel();

  // Ensure topology exists
  await setupTopology(channel);

  console.log('[Carbon] Connected to RabbitMQ, starting polling...');

  // Start polling immediately
  pollIntensity();
  pollGeneration();
}

main().catch((error) => {
  console.error('[Carbon] Fatal error:', error.message);
  process.exit(1);
});
