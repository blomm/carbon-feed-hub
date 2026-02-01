import 'dotenv/config';
import { getConnectionManager, Channel } from '../lib/connection';
import { setupTopology, QUEUES } from '../lib/topology';
import { RETRY_HEADER } from '../lib/retry';

async function inspectDLQ(): Promise<void> {
  const manager = getConnectionManager();
  const channel: Channel = await manager.getChannel();
  await setupTopology(channel);

  const queueInfo = await channel.checkQueue(QUEUES.DLQ);
  const count = queueInfo.messageCount;

  console.log(`\n=== Dead Letter Queue Inspector ===`);
  console.log(`Queue: ${QUEUES.DLQ}`);
  console.log(`Messages: ${count}`);
  console.log('');

  if (count === 0) {
    console.log('DLQ is empty. No failed messages to inspect.');
    await manager.close();
    return;
  }

  const limit = Math.min(count, 10);
  console.log(`Showing ${limit} of ${count} message(s):\n`);

  for (let i = 0; i < limit; i++) {
    const msg = await channel.get(QUEUES.DLQ, { noAck: false });
    if (!msg) break;

    const index = i + 1;
    const headers = msg.properties.headers ?? {};
    const retryCount = headers[RETRY_HEADER] ?? 0;
    const xDeath = headers['x-death'] as Array<Record<string, unknown>> | undefined;

    console.log(`--- Message ${index} ---`);
    console.log(`  Message ID:   ${msg.properties.messageId ?? 'N/A'}`);
    console.log(`  Routing Key:  ${msg.fields.routingKey}`);
    console.log(`  Retry Count:  ${retryCount}`);
    console.log(`  App ID:       ${msg.properties.appId ?? 'N/A'}`);

    if (xDeath && xDeath.length > 0) {
      const death = xDeath[0];
      console.log(`  Dead Letter Info:`);
      console.log(`    Original Queue: ${death.queue ?? 'unknown'}`);
      console.log(`    Reason:         ${death.reason ?? 'unknown'}`);
      console.log(`    Time:           ${death.time ? new Date(death.time as number).toISOString() : 'unknown'}`);
      console.log(`    DL Count:       ${death.count ?? 'unknown'}`);
    }

    // Try to parse and display body
    try {
      const body = JSON.parse(msg.content.toString());
      console.log(`  Body (summary):`);
      console.log(`    ID:        ${body.id ?? 'N/A'}`);
      console.log(`    Source:    ${body.source ?? 'N/A'}`);
      console.log(`    Type:      ${body.type ?? 'N/A'}`);
      console.log(`    Timestamp: ${body.timestamp ?? 'N/A'}`);
    } catch {
      const raw = msg.content.toString().slice(0, 100);
      console.log(`  Body (raw):  ${raw}${msg.content.length > 100 ? '...' : ''}`);
    }

    console.log('');

    // Put message back in DLQ (non-destructive peek)
    channel.nack(msg, false, true);
  }

  console.log(`=== End of DLQ Inspection ===\n`);
  await manager.close();
}

inspectDLQ().catch((error) => {
  console.error('[DLQ Inspector] Fatal error:', error.message);
  process.exit(1);
});
