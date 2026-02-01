import 'dotenv/config';
import { randomUUID } from 'crypto';
import { getConnectionManager } from '../lib/connection';
import { setupTopology, EXCHANGES, ROUTING_KEYS } from '../lib/topology';

const SCENARIOS = ['malformed-json', 'missing-fields', 'trigger-retry'] as const;
type Scenario = (typeof SCENARIOS)[number];

async function publishPoisonMessage(scenario: Scenario): Promise<void> {
  const manager = getConnectionManager();
  const channel = await manager.getChannel();
  await setupTopology(channel);

  const publishOptions = {
    contentType: 'application/json',
    contentEncoding: 'utf-8',
    deliveryMode: 2 as const,
    timestamp: Math.floor(Date.now() / 1000),
    appId: 'poison-test',
  };

  switch (scenario) {
    case 'malformed-json': {
      console.log('[Poison] Publishing malformed JSON → should be a PERMANENT error (straight to DLQ)');
      channel.publish(
        EXCHANGES.TOPIC,
        ROUTING_KEYS.CARBON_INTENSITY,
        Buffer.from('{"incomplete": '),
        { ...publishOptions, messageId: randomUUID() }
      );
      break;
    }

    case 'missing-fields': {
      console.log('[Poison] Publishing message with null data → should be a PERMANENT error (straight to DLQ)');
      const badEnvelope = {
        id: randomUUID(),
        source: 'poison-test',
        type: 'feed.carbon.intensity',
        timestamp: new Date().toISOString(),
        data: null,
      };
      channel.publish(
        EXCHANGES.TOPIC,
        ROUTING_KEYS.CARBON_INTENSITY,
        Buffer.from(JSON.stringify(badEnvelope)),
        { ...publishOptions, messageId: badEnvelope.id }
      );
      break;
    }

    case 'trigger-retry': {
      console.log('[Poison] Publishing message with x-test-trigger-failure header → should retry 3 times then DLQ');
      const envelope = {
        id: randomUUID(),
        source: 'poison-test',
        type: 'feed.carbon.intensity',
        timestamp: new Date().toISOString(),
        data: {
          periodStart: new Date().toISOString(),
          periodEnd: new Date().toISOString(),
          forecast: 999,
          actual: null,
          index: 'very high',
        },
      };
      channel.publish(
        EXCHANGES.TOPIC,
        ROUTING_KEYS.CARBON_INTENSITY,
        Buffer.from(JSON.stringify(envelope)),
        {
          ...publishOptions,
          messageId: envelope.id,
          headers: { 'x-test-trigger-failure': true },
        }
      );
      break;
    }
  }

  console.log(`[Poison] Message published (scenario: ${scenario})`);

  // Give time for the publish to flush
  await new Promise((resolve) => setTimeout(resolve, 500));
  await manager.close();
}

// CLI entry point
const scenario = process.argv[2] as Scenario | undefined;

if (!scenario || !SCENARIOS.includes(scenario)) {
  console.log('Usage: tsx src/test/poison-message-publisher.ts <scenario>');
  console.log('');
  console.log('Scenarios:');
  console.log('  malformed-json   - Invalid JSON (permanent error, straight to DLQ)');
  console.log('  missing-fields   - Valid JSON but null data (permanent error)');
  console.log('  trigger-retry    - Valid message with test failure header (retries then DLQ)');
  process.exit(1);
}

publishPoisonMessage(scenario).catch((error) => {
  console.error('[Poison] Fatal error:', error.message);
  process.exit(1);
});
