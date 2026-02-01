import { ConsumeMessage } from 'amqplib';
import { Channel } from './connection';

// ============================================================================
// Constants
// ============================================================================

export const RETRY_HEADER = 'x-retry-count';
export const MAX_RETRY_ATTEMPTS = 3;

// ============================================================================
// Error Classification
// ============================================================================

export enum ErrorType {
  TRANSIENT = 'TRANSIENT',
  PERMANENT = 'PERMANENT',
}

const TRANSIENT_PATTERNS = [
  'timeout',
  'econnrefused',
  'etimedout',
  'econnreset',
  'enotfound',
  '503',
  '429',
  'socket hang up',
  'resource temporarily unavailable',
];

/**
 * Classifies an error as transient (retryable) or permanent (straight to DLQ).
 *
 * - SyntaxError (malformed JSON) and TypeError (missing fields) are permanent.
 * - Known transient patterns (network, timeouts) are retryable.
 * - Unknown errors default to TRANSIENT (fail-safe: retry before giving up).
 */
export function classifyError(error: Error): ErrorType {
  if (error instanceof SyntaxError || error instanceof TypeError) {
    return ErrorType.PERMANENT;
  }

  const message = error.message.toLowerCase();
  for (const pattern of TRANSIENT_PATTERNS) {
    if (message.includes(pattern)) {
      return ErrorType.TRANSIENT;
    }
  }

  // Default to transient — retry unknown errors before sending to DLQ
  return ErrorType.TRANSIENT;
}

// ============================================================================
// Retry Count Helpers
// ============================================================================

/**
 * Reads the x-retry-count header from a consumed message.
 * Returns 0 if the header doesn't exist or isn't a valid number.
 */
export function getRetryCount(msg: ConsumeMessage): number {
  const headers = msg.properties.headers;
  if (!headers) return 0;

  const count = headers[RETRY_HEADER];
  if (typeof count === 'number' && Number.isFinite(count)) {
    return count;
  }
  return 0;
}

/**
 * Determines whether a message should be retried based on error type
 * and the current retry count.
 */
export function shouldRetry(msg: ConsumeMessage, error: Error): boolean {
  if (classifyError(error) === ErrorType.PERMANENT) {
    return false;
  }
  return getRetryCount(msg) < MAX_RETRY_ATTEMPTS;
}

// ============================================================================
// Republish with Retry
// ============================================================================

/**
 * Republishes a message to its original exchange with an incremented
 * x-retry-count header. The caller must ack the original message after
 * this function succeeds.
 *
 * This "republish pattern" is used because RabbitMQ's nack-with-requeue
 * does not allow modifying message headers.
 */
export function republishWithRetry(channel: Channel, msg: ConsumeMessage): void {
  const retryCount = getRetryCount(msg) + 1;
  const headers = { ...(msg.properties.headers ?? {}), [RETRY_HEADER]: retryCount };

  channel.publish(msg.fields.exchange, msg.fields.routingKey, msg.content, {
    ...msg.properties,
    headers,
  });
}
