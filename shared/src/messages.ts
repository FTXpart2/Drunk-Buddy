// The Channel interface is the seam between the agent and the outside world.
// LocalChannel (terminal) and BlueBubblesChannel (iMessage) both implement it,
// so the whole loop is testable without the Mac gateway ("mock the edges").

export interface InboundAttachment {
  path?: string;
  url?: string;
  mimeType?: string;
  name?: string;
}

export interface InboundMessage {
  /** handle.address from the webhook — the join key for all state. */
  phone: string;
  text?: string;
  attachment?: InboundAttachment;
  /** Coords from a shared iMessage "Send My Current Location" pin, if present. */
  location?: { lat: number; lon: number };
  /** where to send the reply (chats[].guid). */
  chatGuid: string;
  raw?: unknown;
}

export type InboundHandler = (msg: InboundMessage) => void | Promise<void>;

export interface Channel {
  readonly name: string;
  /** Register the handler that runs the agent loop for each inbound message. */
  onMessage(handler: InboundHandler): void;
  sendText(chatGuid: string, text: string): Promise<void>;
  sendAudio(chatGuid: string, filePath: string): Promise<void>;
  /** Begin receiving (LocalChannel: read stdin; BlueBubbles: no-op, webhook is mounted on the server). */
  start(): Promise<void>;
}
