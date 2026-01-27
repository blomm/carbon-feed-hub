import { getConnectionManager, Channel } from './connection';

// Exchange definitions
export const EXCHANGES = {
  TOPIC: 'feeds.topic',
  DLX: 'feeds.dlx',
} as const;

// Queue definitions
export const QUEUES = {
  ALL: 'feeds.all',
  CARBON: 'feeds.carbon',
  WEATHER: 'feeds.weather',
  DLQ: 'feeds.dlq',
} as const;

// Routing keys
export const ROUTING_KEYS = {
  CARBON_INTENSITY: 'feed.carbon.intensity',
  CARBON_GENERATION: 'feed.carbon.generation',
  WEATHER_CURRENT: 'feed.weather.current',
  WEATHER_FORECAST: 'feed.weather.forecast',
} as const;

// Binding patterns
const BINDINGS = {
  ALL: 'feed.#',
  CARBON: 'feed.carbon.*',
  WEATHER: 'feed.weather.*',
} as const;

export async function setupTopology(channel: Channel): Promise<void> {
  console.log('[Topology] Setting up RabbitMQ topology...');

  // Create exchanges
  console.log('[Topology] Creating exchanges...');

  await channel.assertExchange(EXCHANGES.TOPIC, 'topic', {
    durable: true,
    autoDelete: false,
  });
  console.log(`[Topology] Created exchange: ${EXCHANGES.TOPIC} (topic)`);

  await channel.assertExchange(EXCHANGES.DLX, 'fanout', {
    durable: true,
    autoDelete: false,
  });
  console.log(`[Topology] Created exchange: ${EXCHANGES.DLX} (fanout)`);

  // Create queues with dead letter exchange
  console.log('[Topology] Creating queues...');

  const queueOptions = {
    durable: true,
    deadLetterExchange: EXCHANGES.DLX,
  };

  await channel.assertQueue(QUEUES.ALL, queueOptions);
  console.log(`[Topology] Created queue: ${QUEUES.ALL}`);

  await channel.assertQueue(QUEUES.CARBON, queueOptions);
  console.log(`[Topology] Created queue: ${QUEUES.CARBON}`);

  await channel.assertQueue(QUEUES.WEATHER, queueOptions);
  console.log(`[Topology] Created queue: ${QUEUES.WEATHER}`);

  // DLQ doesn't need a dead letter exchange itself
  await channel.assertQueue(QUEUES.DLQ, { durable: true });
  console.log(`[Topology] Created queue: ${QUEUES.DLQ}`);

  // Create bindings
  console.log('[Topology] Creating bindings...');

  await channel.bindQueue(QUEUES.ALL, EXCHANGES.TOPIC, BINDINGS.ALL);
  console.log(`[Topology] Bound ${QUEUES.ALL} to ${EXCHANGES.TOPIC} with pattern "${BINDINGS.ALL}"`);

  await channel.bindQueue(QUEUES.CARBON, EXCHANGES.TOPIC, BINDINGS.CARBON);
  console.log(`[Topology] Bound ${QUEUES.CARBON} to ${EXCHANGES.TOPIC} with pattern "${BINDINGS.CARBON}"`);

  await channel.bindQueue(QUEUES.WEATHER, EXCHANGES.TOPIC, BINDINGS.WEATHER);
  console.log(`[Topology] Bound ${QUEUES.WEATHER} to ${EXCHANGES.TOPIC} with pattern "${BINDINGS.WEATHER}"`);

  // Bind DLQ to the dead letter exchange
  await channel.bindQueue(QUEUES.DLQ, EXCHANGES.DLX, '');
  console.log(`[Topology] Bound ${QUEUES.DLQ} to ${EXCHANGES.DLX}`);

  console.log('[Topology] Setup complete!');
}

// Standalone script to set up topology
async function main(): Promise<void> {
  const manager = getConnectionManager();

  try {
    const channel = await manager.getChannel();
    await setupTopology(channel);

    console.log('\n[Topology] Topology setup successful!');
    console.log('[Topology] You can verify in RabbitMQ Management UI at http://localhost:15672');
    console.log('[Topology] Default credentials: guest / guest');
  } catch (error) {
    console.error('[Topology] Setup failed:', (error as Error).message);
    process.exit(1);
  } finally {
    await manager.close();
  }
}

// Run if executed directly
if (require.main === module) {
  require('dotenv').config();
  main();
}
