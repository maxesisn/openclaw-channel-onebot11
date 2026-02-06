import { z } from "zod";

export const OneBot11ConfigSchema = z.object({
  /** Reverse WS server listen */
  listenHost: z.string().optional().default("127.0.0.1").describe("Reverse WS server host to listen on"),
  listenPort: z.number().int().positive().optional().default(3002).describe("Reverse WS server port"),
  wsPath: z.string().optional().default("/onebot/v11/ws").describe("WebSocket path"),

  /** Auth */
  accessToken: z.string().min(1).optional().describe("Bearer token required from OneBot client"),


  /** Context */
  includeReplyOriginal: z.boolean().optional().default(true).describe("If message contains reply segment, fetch original and include in context"),
  replyMaxChars: z.number().int().positive().optional().default(1200).describe("Max chars of quoted reply content"),

  /** Sending */
  maxMessageLength: z.number().int().positive().optional().default(3500).describe("Split outgoing text into chunks"),
  rateLimitMs: z.number().int().nonnegative().optional().default(800).describe("Delay between chunks (ms)"),
  markdownToText: z.boolean().optional().default(true).describe("Downgrade markdown-ish output to plain text"),

  /** Media */
  maxInboundImages: z.number().int().positive().optional().default(3).describe("Max inbound image urls to attach"),
});

export type OneBot11Config = z.infer<typeof OneBot11ConfigSchema>;
