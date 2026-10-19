export interface BotHeartbeat {
  Id: number;
  BotName: string;
  ExchangeId: number;
  HeartbeatReceived: boolean;
  HeartbeatReceivedAt: string | null;
  MessageSent: boolean;
  MessageSentAt: string | null;
  MessageReceived: boolean;
  MessageReceivedAt: string | null;
  LastUpdated: string | null;
  HeartbeatReceivedColor: number;
  MessageSentColor: number;
  MessageReceivedColor: number;
}

/** HeartbeatStatusColor.Green on the API: heartbeat received within the last 2 minutes. */
export const HEARTBEAT_GREEN = 0;

/** A bot counts as running when its heartbeat is recent; the message flags depend on the bot's role. */
export function isHeartbeatGreen(row: BotHeartbeat): boolean {
  return row.HeartbeatReceivedColor === HEARTBEAT_GREEN;
}
