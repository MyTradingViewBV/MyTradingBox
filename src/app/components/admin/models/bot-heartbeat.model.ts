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
