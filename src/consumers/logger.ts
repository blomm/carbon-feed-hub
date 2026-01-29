import 'dotenv/config';
import { ConsumeMessage } from 'amqplib';
import { getConnectionManager, Channel } from '../lib/connection';
import { setupTopology, QUEUES } from '../lib/topology';
import {
  MessageEnvelope,
  CarbonIntensityData,
  CarbonGenerationData,
  WeatherCurrentData,
  MESSAGE_TYPES,
} from '../lib/messages';

// ============================================================================
// State
// ============================================================================

let channel: Channel | null = null;
let consumerTag: string | null = null;
let isShuttingDown = false;

// ============================================================================
// Message Formatting
// ============================================================================

function formatMessageSummary(envelope: MessageEnvelope): string {
  switch (envelope.type) {
    case MESSAGE_TYPES.CARBON_INTENSITY: {
      const data = envelope.data as CarbonIntensityData;
      return `Intensity: ${data.forecast} gCO2/kWh (${data.index}), actual: ${data.actual ?? 'pending'}`;
    }
    case MESSAGE_TYPES.CARBON_GENERATION: {
      const data = envelope.data as CarbonGenerationData;
      const topSources = data.mix
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 3)
        .map((s) => `${s.fuel}: ${s.percentage.toFixed(1)}%`)
        .join(', ');
      return `Generation: ${topSources}`;
    }
    case MESSAGE_TYPES.WEATHER_CURRENT: {
      const data = envelope.data as WeatherCurrentData;
      return `${data.location.city}: ${data.temperature.current}°C, ${data.condition.description}`;
    }
    default:
      return `Unknown message type: ${envelope.type}`;
  }
}

// ============================================================================
// Message Handler
// ============================================================================

function handleMessage(msg: ConsumeMessage | null): void {
  if (!msg || !channel) return;

  try {
    const envelope = JSON.parse(msg.content.toString()) as MessageEnvelope;
    const routingKey = msg.fields.routingKey;
    const receivedAt = new Date().toISOString();

    // Log the message
    console.log(`[Logger] ${receivedAt} | ${routingKey} | ${envelope.id}`);
    console.log(`         ${formatMessageSummary(envelope)}`);

    // Acknowledge the message
    channel.ack(msg);
  } catch (error) {
    console.error('[Logger] Failed to process message:', (error as Error).message);
    // Reject without requeue on parse errors (message is malformed)
    channel.nack(msg, false, false);
  }
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function shutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('\n[Logger] Shutting down...');

  // Cancel consumer first
  if (channel && consumerTag) {
    try {
      await channel.cancel(consumerTag);
      console.log('[Logger] Consumer cancelled');
    } catch {
      // Ignore errors during shutdown
    }
  }

  const manager = getConnectionManager();
  await manager.close();

  console.log('[Logger] Shutdown complete');
  process.exit(0);
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  console.log('[Logger] Starting Logger Consumer...');

  // Register shutdown handlers
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Connect to RabbitMQ
  const manager = getConnectionManager();
  channel = await manager.getChannel();

  // Ensure topology exists
  await setupTopology(channel);

  // Set prefetch (process up to 10 messages concurrently)
  await channel.prefetch(10);

  // Start consuming from feeds.all queue
  const { consumerTag: tag } = await channel.consume(QUEUES.ALL, handleMessage);
  consumerTag = tag;

  console.log(`[Logger] Listening on queue: ${QUEUES.ALL}`);
  console.log('[Logger] Waiting for messages... (Ctrl+C to exit)');
}

main().catch((error) => {
  console.error('[Logger] Fatal error:', error.message);
  process.exit(1);
});
