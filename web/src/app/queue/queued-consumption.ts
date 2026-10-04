import { CreateConsumptionInput } from '../data/consumption';
import { CreateOneTimeInput } from '../data/one-time';

/**
 * A consumption recorded without an answer from the server, waiting on the phone to be sent
 * (design-android.md, "queue (Pending)"). It keeps what the user entered, the time it was recorded
 * (its `occurredAt`, never the time it is sent) and its clientRef, which makes sending it twice safe.
 * `v` is its format: every later app version reads the older ones.
 */
export interface QueuedConsumption {
  v: 1;
  clientRef: string;
  /** The server and the user it belongs to: sent only with that user's session on that server. */
  server: string;
  userId: number;
  /** When it was recorded (ISO 8601): the order of sending. */
  recordedAt: string;
  /** "pending" waits to be sent; "to-fix" was refused by the server for a reason of the data. */
  state: 'pending' | 'to-fix';
  /** The server's reason, for a consumption to fix. */
  reason: string | null;
  /** What is sent, exactly: to a batch, or a one-time consumption of a substance. */
  request:
    | { kind: 'batch'; batchId: number; body: CreateConsumptionInput }
    | { kind: 'one-time'; substanceId: number; body: CreateOneTimeInput };
  /** What its card shows, from the last data when it was recorded. */
  shown: {
    substanceId: number;
    substanceName: string;
    unit: string;
    batchName: string | null;
  };
}
