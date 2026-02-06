import {
  type ChannelPlugin,
  type ChannelAccountSnapshot,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  type ReplyPayload,
  applyAccountNameToChannelSection,
  migrateBaseNameToDefaultAccount,
} from "openclaw/plugin-sdk";

import type { OneBot11AnyEvent, OneBot11Message, OneBot11MessageSegment } from "./types.js";
import { OneBot11ConfigSchema, type OneBot11Config } from "./config.js";
import { getOneBot11Runtime, getOneBot11Connection, setOneBot11Connection } from "./runtime.js";
import { OneBot11ReverseWSServer } from "./server.js";
import { markdownToPlainTextLight } from "./markdown.js";
import { clampText, isHttpUrl, resolveToBase64Url, sleep, splitTextByLength } from "./utils.js";
import type { OneBot11Connection } from "./onebot_client.js";

export type ResolvedAccount = ChannelAccountSnapshot & {
  config: OneBot11Config;
  runtime?: { running: boolean; lastStartAt?: number; lastError?: string | null };
};

function normalizeTarget(raw: string): string {
  return raw.replace(/^(onebot11:)/i, "");
}

function getTextFromMessage(message: OneBot11Message | string | undefined): string {
  if (!message) return "";
  if (typeof message === "string") return message;
  let out = "";
  for (const seg of message) {
    if (seg.type === "text") out += seg.data?.text ?? "";
    else if (seg.type === "at") out += ` @${seg.data?.qq ?? ""} `;
    else if (seg.type === "image") out += " [图片] ";
    else if (seg.type === "reply") out += " ";
  }
  return out.trim();
}

function getReplyId(message: OneBot11Message | string | undefined, rawMessage?: string): string | null {
  if (message && typeof message !== "string") {
    for (const seg of message) {
      if (seg.type === "reply" && seg.data?.id) return String(seg.data.id);
    }
  }
  if (rawMessage) {
    const m = rawMessage.match(/\[CQ:reply,id=(\d+)\]/);
    if (m) return m[1];
  }
  return null;
}

function extractImageHints(message: OneBot11Message | string | undefined, max = 3): string[] {
  if (!message || typeof message === "string") return [];
  const out: string[] = [];
  for (const seg of message) {
    if (seg.type !== "image") continue;
    const url = seg.data?.url || seg.data?.file;
    if (url && isHttpUrl(url)) {
      out.push(url);
      if (out.length >= max) break;
    }
  }
  return out;
}

export const onebot11Channel: ChannelPlugin<ResolvedAccount> = {
  id: "onebot11",
  meta: {
    id: "onebot11",
    label: "OneBot v11 (Reverse WS)",
    selectionLabel: "OneBot v11",
    docsPath: "extensions/openclaw-channel-onebot11",
    blurb: "Connect via OneBot v11 Reverse WebSocket (DM-only)",
  },
  capabilities: {
    chatTypes: ["direct"],
    media: true,
  },
  configSchema: buildChannelConfigSchema(OneBot11ConfigSchema),
  config: {
    listAccountIds: (cfg) => {
      // @ts-ignore
      const ch = cfg.channels?.onebot11;
      if (!ch) return [];
      if (ch.accounts) return Object.keys(ch.accounts);
      return [DEFAULT_ACCOUNT_ID];
    },
    resolveAccount: (cfg, accountId) => {
      const id = accountId ?? DEFAULT_ACCOUNT_ID;
      // @ts-ignore
      const ch = cfg.channels?.onebot11;
      const accountConfig = id === DEFAULT_ACCOUNT_ID ? ch : ch?.accounts?.[id];
      return {
        accountId: id,
        name: accountConfig?.name ?? "OneBot11",
        enabled: true,
        configured: Boolean(accountConfig?.listenPort),
        tokenSource: accountConfig?.accessToken ? "config" : "none",
        config: accountConfig || {},
      };
    },
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    describeAccount: (acc) => ({ accountId: acc.accountId, configured: acc.configured }),
  },

  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({ cfg, channelKey: "onebot11", accountId, name }),
    validateInput: ({ input }) => null,
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const named = applyAccountNameToChannelSection({
        cfg,
        channelKey: "onebot11",
        accountId,
        name: input.name,
      });

      const next = accountId !== DEFAULT_ACCOUNT_ID
        ? migrateBaseNameToDefaultAccount({ cfg: named, channelKey: "onebot11" })
        : named;

      const newConfig = {
        enabled: true,
        listenHost: input.listenHost,
        listenPort: input.listenPort,
        wsPath: input.wsPath,
        accessToken: input.accessToken,
      };

      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            onebot11: { ...next.channels?.onebot11, ...newConfig },
          },
        };
      }

      return {
        ...next,
        channels: {
          ...next.channels,
          onebot11: {
            ...next.channels?.onebot11,
            enabled: true,
            accounts: {
              ...next.channels?.onebot11?.accounts,
              [accountId]: { ...next.channels?.onebot11?.accounts?.[accountId], ...newConfig },
            },
          },
        },
      };
    },
  },

  gateway: {
    startAccount: async (ctx) => {
      const { account, cfg } = ctx;
      const runtime = getOneBot11Runtime();
      const config = account.config;

      const host = config.listenHost ?? "127.0.0.1";
      const port = config.listenPort ?? 3002;
      const path = config.wsPath ?? "/onebot/v11/ws";

      const server = new OneBot11ReverseWSServer({
        host,
        port,
        path,
        accessToken: config.accessToken,
      });

      let conn: OneBot11Connection | null = null;
      const processed = new Set<string>();
      const dedupTtlMs = 6 * 60_000;
      const processedAt = new Map<string, number>();
      const gcTimer = setInterval(() => {
        const now = Date.now();
        for (const [k, t] of processedAt.entries()) {
          if (now - t > dedupTtlMs) {
            processedAt.delete(k);
            processed.delete(k);
          }
        }
      }, 60_000);

      server.onConnection((c, req) => {
        conn = c;
        setOneBot11Connection(account.accountId, c);
        const remote = `${req.socket.remoteAddress ?? "?"}:${req.socket.remotePort ?? "?"}`;
        runtime.channel.activity.record({ channel: "onebot11", accountId: account.accountId, direction: "inbound" });

        c.on("close", () => {
          console.log(`[OneBot11] WS closed; remote=${remote}`);
          if (conn === c) conn = null;
          setOneBot11Connection(account.accountId, null);
        });
        c.on("error", (err) => {
          console.warn(`[OneBot11] WS error; remote=${remote}`, err);
        });

        c.on("event", async (ev: OneBot11AnyEvent) => {
          try {
            if (ev?.post_type !== "message") return;
            // DM-only by default
            // @ts-ignore
            if (ev.message_type !== "private") return;
            // @ts-ignore
            const userId = ev.user_id;
            if (!userId) return;

            // Dedup
            // @ts-ignore
            const messageId = ev.message_id;
            const key = messageId ? String(messageId) : `${ev.time}:${userId}:${getTextFromMessage(ev.message)}`;
            if (processed.has(key)) return;
            processed.add(key);
            processedAt.set(key, Date.now());

            // Build context
            const rawText = (ev.raw_message ?? getTextFromMessage(ev.message)).trim();
            const replyId = getReplyId(ev.message, ev.raw_message);

            try {
              const mid = (ev as any).message_id;
              const preview = rawText.length > 120 ? rawText.slice(0, 120) + "…" : rawText;
              console.log(`[OneBot11] IN dm from=${String(userId)} message_id=${mid ?? "?"} reply_id=${replyId ?? "-"} text=${JSON.stringify(preview)}`);
            } catch {
              // ignore
            }

            let replyBlock = "";
            if (replyId && config.includeReplyOriginal) {
              try {
                const msg = await c.callAction<any>("get_msg", { message_id: replyId });
                const original = (msg?.raw_message ?? getTextFromMessage(msg?.message)).trim();
                if (original) {
                  replyBlock = `\n\n[Replying to original]\n${clampText(original, config.replyMaxChars ?? 1200)}\n[/Replying]`;
                }
              } catch {
                // ignore
              }
            }

            const body = rawText + replyBlock;
            const senderName = ev.sender?.nickname || ev.sender?.card || `User ${userId}`;

            const mediaUrls = extractImageHints(ev.message, config.maxInboundImages ?? 3);

            // Important: use channel-prefixed sender ids so Gateway command authorization
            // can match channels.onebot11.allowFrom entries like "onebot11:176...".
            const fromId = `onebot11:${String(userId)}`;

            // Compute CommandAuthorized so Gateway can safely run slash commands.
            // Default-deny behavior is common across channels; plugins must explicitly
            // opt in for known senders.
            const allowFrom = (
              // @ts-ignore
              cfg.channels?.onebot11?.allowFrom ??
              // @ts-ignore
              cfg.channels?.onebot11?.accounts?.[account.accountId]?.allowFrom ??
              []
            ) as string[];
            const commandAuthorized = Array.isArray(allowFrom)
              ? allowFrom.some((x) => String(x).trim() === fromId || String(x).trim() === String(userId))
              : false;

            const ctxPayload = runtime.channel.reply.finalizeInboundContext({
              Provider: "onebot11",
              Channel: "onebot11",
              From: fromId,
              To: "onebot11:bot",
              Body: body,
              RawBody: rawText,
              SenderId: fromId,
              SenderName: senderName,
              ConversationLabel: `OneBot11 DM ${userId}`,
              SessionKey: `onebot11:dm:${userId}`,
              AccountId: account.accountId,
              ChatType: "direct",
              Timestamp: ev.time * 1000,
              OriginatingChannel: "onebot11",
              OriginatingTo: String(userId),
              CommandAuthorized: commandAuthorized,
              ...(mediaUrls.length ? { MediaUrls: mediaUrls } : {}),
              ...(replyId ? { ReplyToId: String(replyId) } : {}),
            });

            const deliver = async (payload: ReplyPayload) => {
              let repliedOnce = false;

              const buildPrefix = () => {
                if (repliedOnce) return [];
                if (!config.sendReplySegment) return [];
                if (!messageId) return [];
                repliedOnce = true;
                return [{ type: "reply", data: { id: String(messageId) } }];
              };

              const sendText = async (text: string) => {
                let t = text;
                // Default-on: if config defaults are not materialized, treat undefined as true
                if (config.markdownToText !== false) t = markdownToPlainTextLight(t);
                const chunks = splitTextByLength(t, config.maxMessageLength ?? 3500);
                for (let i = 0; i < chunks.length; i++) {
                  const prefix = i === 0 ? buildPrefix() : [];
                  c.sendAction("send_private_msg", {
                    user_id: userId,
                    message: [...prefix, { type: "text", data: { text: chunks[i] } }],
                  });
                  if (chunks.length > 1) await sleep(config.rateLimitMs ?? 800);
                }
              };

              if (payload.text) await sendText(payload.text);

              if (payload.files?.length) {
                for (const f of payload.files) {
                  if (!f.url) continue;
                  const u = await resolveToBase64Url(f.url);
                  // If image-like, send as image segment; otherwise send as text link
                  const isImg = /\.(png|jpe?g|gif|webp)$/i.test(u) || u.startsWith("base64://");
                  if (isImg) {
                    const prefix = buildPrefix();
                    c.sendAction("send_private_msg", {
                      user_id: userId,
                      message: [
                        ...prefix,
                        ...(f.name ? [{ type: "text", data: { text: f.name } }] : []),
                        { type: "image", data: { file: u } },
                      ],
                    });
                  } else {
                    await sendText(`${f.name ? f.name + ": " : ""}${u}`);
                  }
                  await sleep(config.rateLimitMs ?? 800);
                }
              }
            };

            const { dispatcher, replyOptions } = runtime.channel.reply.createReplyDispatcherWithTyping({ deliver });

            await runtime.channel.session.recordInboundSession({
              storePath: runtime.channel.session.resolveStorePath(cfg.session?.store, { agentId: "default" }),
              sessionKey: ctxPayload.SessionKey!,
              ctx: ctxPayload,
              updateLastRoute: { sessionKey: ctxPayload.SessionKey!, channel: "onebot11", to: String(userId), accountId: account.accountId },
              onRecordError: (err) => console.error("OneBot11 session record error", err),
            });

            await runtime.channel.reply.dispatchReplyFromConfig({ ctx: ctxPayload, cfg, dispatcher, replyOptions });
          } catch (err) {
            console.error("OneBot11 inbound handling error", err);
          }
        });
      });

      try {
        await server.listen();
      } catch (err) {
        // Prevent gateway crash on transient port conflicts during restart.
        console.error(`[OneBot11] Reverse WS listen failed on ws://${host}:${port}${path} (account=${account.accountId})`, err);
        return async () => {
          clearInterval(gcTimer);
          await server.close().catch(() => undefined);
          conn = null;
        };
      }

      console.log(`[OneBot11] Reverse WS listening on ws://${host}:${port}${path} (account=${account.accountId})`);

      return async () => {
        clearInterval(gcTimer);
        await server.close().catch(() => undefined);
        conn = null;
      };
    },
  },

  outbound: {
    sendText: async ({ to, text, accountId }) => {
      const accId = accountId ?? DEFAULT_ACCOUNT_ID;
      const conn = getOneBot11Connection(accId);
      const userId = normalizeTarget(String(to));

      if (process.env.ONEBOT11_DEBUG === "1") {
        console.log(
          `[OneBot11] outbound.sendText accountId=${String(accountId ?? "(none)")} resolvedAccountId=${accId} to=${String(to)} userId=${userId} conn=${conn ? "ok" : "null"}`,
        );
      }

      if (!conn) return { channel: "onebot11", sent: false, error: "Reverse WS connection required" };

      const t = String(text ?? "");

      // Split long text (best-effort)
      const chunks = splitTextByLength(t, 3500);
      for (let i = 0; i < chunks.length; i++) {
        conn.sendAction("send_private_msg", {
          user_id: Number(userId),
          message: [{ type: "text", data: { text: chunks[i] } }],
        });
        if (chunks.length > 1) await sleep(800);
      }
      return { channel: "onebot11", sent: true };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId }) => {
      const accId = accountId ?? DEFAULT_ACCOUNT_ID;
      const conn = getOneBot11Connection(accId);
      const userId = normalizeTarget(String(to));

      if (process.env.ONEBOT11_DEBUG === "1") {
        console.log(
          `[OneBot11] outbound.sendMedia accountId=${String(accountId ?? "(none)")} resolvedAccountId=${accId} to=${String(to)} userId=${userId} hasText=${Boolean(text)} hasMedia=${Boolean(mediaUrl)} conn=${conn ? "ok" : "null"}`,
        );
      }

      if (!conn) return { channel: "onebot11", sent: false, error: "Reverse WS connection required" };

      if (text) {
        conn.sendAction("send_private_msg", {
          user_id: Number(userId),
          message: [{ type: "text", data: { text: String(text) } }],
        });
        await sleep(800);
      }

      if (mediaUrl) {
        const u = await resolveToBase64Url(mediaUrl);
        conn.sendAction("send_private_msg", {
          user_id: Number(userId),
          message: [{ type: "image", data: { file: u } }],
        });
      }

      return { channel: "onebot11", sent: true };
    },
  },

  messaging: {
    normalizeTarget,
    targetResolver: {
      looksLikeId: (id) => /^\d{5,12}$/.test(id),
      hint: "OneBot11 user_id (QQ号) for DM",
    },
  },
};
