import 'dotenv/config';
import { ConsumeMessage } from 'amqplib';
import { getConnectionManager, Channel } from '../lib/connection';
import { setupTopology, QUEUES } from '../lib/topology';
import {
  MessageEnvelope,
  CarbonIntensityData,
  CarbonGenerationData,
  MESSAGE_TYPES,
} from '../lib/messages';

// ============================================================================
// Consumer Identity (unique per instance for competing consumer demo)
// ============================================================================

const CONSUMER_ID = `Aggregator-${Math.random().toString(36).slice(2, 6)}`;

// ============================================================================
// State
// ============================================================================

let channel: Channel | null = null;
let consumerTag: string | null = null;
let isShuttingDown = false;

// ============================================================================
// Message Processing
// ============================================================================

function processIntensity(data: CarbonIntensityData): void {
  console.log(`  Forecast: ${data.forecast} gCO2/kWh | Actual: ${data.actual ?? 'pending'} | Index: ${data.index}`);
  console.log(`  Period: ${data.periodStart} → ${data.periodEnd}`);
}

function processGeneration(data: CarbonGenerationData): void {
  const formatted = data.mix
    .sort((a, b) => b.percentage - a.percentage)
    .map((s) => `${s.fuel}: ${s.percentage.toFixed(1)}%`)
    .join(' | ');
  console.log(`  ${formatted}`);
}

// ============================================================================
// Message Handler
// ============================================================================

function handleMessage(msg: ConsumeMessage | null): void {
  if (!msg || !channel) return;

  try {
    const envelope = JSON.parse(msg.content.toString()) as MessageEnvelope;
    const routingKey = msg.fields.routingKey;

    console.log(`[${CONSUMER_ID}] Processing ${routingKey} | ${envelope.id}`);

    switch (envelope.type) {
      case MESSAGE_TYPES.CARBON_INTENSITY:
        processIntensity(envelope.data as CarbonIntensityData);
        break;
      case MESSAGE_TYPES.CARBON_GENERATION:
        processGeneration(envelope.data as CarbonGenerationData);
        break;
      default:
        console.log(`  Unknown message type: ${envelope.type}`);
    }

    channel.ack(msg);
  } catch (error) {
    console.error(`[${CONSUMER_ID}] Failed to process message:`, (error as Error).message);
    channel.nack(msg, false, false);
  }
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function shutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[${CONSUMER_ID}] Shutting down...`);

  if (channel && consumerTag) {
    try {
      await channel.cancel(consumerTag);
      console.log(`[${CONSUMER_ID}] Consumer cancelled`);
    } catch {
      // Ignore errors during shutdown
    }
  }

  const manager = getConnectionManager();
  await manager.close();

  console.log(`[${CONSUMER_ID}] Shutdown complete`);
  process.exit(0);
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  console.log(`[${CONSUMER_ID}] Starting Carbon Aggregator Consumer...`);

  // Register shutdown handlers
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Connect to RabbitMQ
  const manager = getConnectionManager();
  channel = await manager.getChannel();

  // Ensure topology exists
  await setupTopology(channel);

  // Set prefetch to 1 for fair distribution across competing consumers
  await channel.prefetch(1);

  // Start consuming from feeds.carbon queue
  const { consumerTag: tag } = await channel.consume(QUEUES.CARBON, handleMessage);
  consumerTag = tag;

  console.log(`[${CONSUMER_ID}] Listening on queue: ${QUEUES.CARBON} (prefetch=1)`);
  console.log(`[${CONSUMER_ID}] Waiting for messages... (Ctrl+C to exit)`);
}

main().catch((error) => {
  console.error(`[${CONSUMER_ID}] Fatal error:`, error.message);
  process.exit(1);
});
