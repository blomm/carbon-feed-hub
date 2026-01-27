import amqp from 'amqplib';

export interface ConnectionManagerOptions {
  url: string;
  maxRetries?: number;
  initialRetryDelay?: number;
  maxRetryDelay?: number;
}

type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>;
type AmqpChannel = Awaited<ReturnType<AmqpConnection['createChannel']>>;

type ConnectionListener = (connection: AmqpConnection) => void;
type ErrorListener = (error: Error) => void;

export class ConnectionManager {
  private url: string;
  private maxRetries: number;
  private initialRetryDelay: number;
  private maxRetryDelay: number;

  private connection: AmqpConnection | null = null;
  private channel: AmqpChannel | null = null;
  private isConnecting = false;
  private isClosed = false;
  private retryCount = 0;

  private connectionListeners: ConnectionListener[] = [];
  private errorListeners: ErrorListener[] = [];

  constructor(options: ConnectionManagerOptions) {
    this.url = options.url;
    this.maxRetries = options.maxRetries ?? 10;
    this.initialRetryDelay = options.initialRetryDelay ?? 1000;
    this.maxRetryDelay = options.maxRetryDelay ?? 30000;
  }

  async connect(): Promise<AmqpConnection> {
    if (this.connection) {
      return this.connection;
    }

    if (this.isConnecting) {
      return new Promise((resolve, reject) => {
        this.onConnection((conn) => resolve(conn));
        this.onError((err) => reject(err));
      });
    }

    this.isConnecting = true;
    this.isClosed = false;

    while (this.retryCount <= this.maxRetries && !this.isClosed) {
      try {
        const conn = await amqp.connect(this.url);
        this.connection = conn;
        this.retryCount = 0;
        this.isConnecting = false;

        conn.on('error', (err: Error) => {
          console.error('[ConnectionManager] Connection error:', err.message);
          this.handleDisconnect();
        });

        conn.on('close', () => {
          if (!this.isClosed) {
            console.warn('[ConnectionManager] Connection closed unexpectedly');
            this.handleDisconnect();
          }
        });

        console.log('[ConnectionManager] Connected to RabbitMQ');
        this.connectionListeners.forEach((listener) => listener(conn));
        this.connectionListeners = [];

        return conn;
      } catch (error) {
        this.retryCount++;
        const delay = this.calculateBackoff();

        console.error(
          `[ConnectionManager] Connection attempt ${this.retryCount} failed:`,
          (error as Error).message
        );

        if (this.retryCount > this.maxRetries) {
          this.isConnecting = false;
          const finalError = new Error(
            `Failed to connect after ${this.maxRetries} attempts: ${(error as Error).message}`
          );
          this.errorListeners.forEach((listener) => listener(finalError));
          this.errorListeners = [];
          throw finalError;
        }

        console.log(`[ConnectionManager] Retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    throw new Error('Connection aborted');
  }

  async getChannel(): Promise<AmqpChannel> {
    if (this.channel) {
      return this.channel;
    }

    const connection = await this.connect();
    const ch = await connection.createChannel();
    this.channel = ch;

    ch.on('error', (err: Error) => {
      console.error('[ConnectionManager] Channel error:', err.message);
      this.channel = null;
    });

    ch.on('close', () => {
      console.warn('[ConnectionManager] Channel closed');
      this.channel = null;
    });

    return ch;
  }

  async close(): Promise<void> {
    this.isClosed = true;

    if (this.channel) {
      try {
        await this.channel.close();
      } catch {
        // Ignore close errors
      }
      this.channel = null;
    }

    if (this.connection) {
      try {
        await this.connection.close();
      } catch {
        // Ignore close errors
      }
      this.connection = null;
    }

    console.log('[ConnectionManager] Connection closed');
  }

  onConnection(listener: ConnectionListener): void {
    this.connectionListeners.push(listener);
  }

  onError(listener: ErrorListener): void {
    this.errorListeners.push(listener);
  }

  isConnected(): boolean {
    return this.connection !== null && !this.isClosed;
  }

  private handleDisconnect(): void {
    this.connection = null;
    this.channel = null;

    if (!this.isClosed) {
      console.log('[ConnectionManager] Attempting to reconnect...');
      this.connect().catch((err) => {
        console.error('[ConnectionManager] Reconnection failed:', err.message);
      });
    }
  }

  private calculateBackoff(): number {
    const delay = this.initialRetryDelay * Math.pow(2, this.retryCount - 1);
    return Math.min(delay, this.maxRetryDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance for shared use
let defaultManager: ConnectionManager | null = null;

export function getConnectionManager(url?: string): ConnectionManager {
  if (!defaultManager) {
    const connectionUrl = url ?? process.env.RABBITMQ_URL ?? 'amqp://localhost';
    defaultManager = new ConnectionManager({ url: connectionUrl });
  }
  return defaultManager;
}

// Re-export Channel type for consumers
export type { AmqpChannel as Channel };
