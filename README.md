# @openclaw/channel-onebot11

A minimal, **DM-only** OneBot v11 channel plugin for OpenClaw (Reverse WebSocket).

This project intentionally focuses on the “small & safe by default” subset:
- **Reverse WS** (e.g. NapCatQQ connects as client)
- **Private messages only** (no groups)
- Token auth (`Authorization: Bearer ...`)
- Quote/reply support (fetch original via `get_msg` and include in context)
- Inbound images (attach up to N URLs to context)
- Outbound: split long text + light markdown downgrade

If you need **group chats / commands / triggers / broader QQ features**, use a more feature-complete integration such as community projects like `openclaw_qq`.

## Scope (by design)

- ✅ OneBot v11 **Reverse WebSocket**
- ✅ **DM-only** (private messages)
- ✅ Token auth (Bearer)
- ✅ Multi-account (configure multiple OpenClaw channel accounts; typically use different ports)
- ✅ Inbound images (attach up to N URLs to context)
- ✅ Reply/quote support (fetch original via `get_msg` and include in context)
- ✅ Outbound: split long text + light markdown downgrade
- ✅ Outbound images via `base64://` (file:// gets converted)

- ❌ Group chats / trigger modes / guilds / admin commands (intentionally out of scope)

## Installation

### Option A: as a local extension (recommended while iterating)

Clone this repo somewhere on the OpenClaw host, then add it to your OpenClaw config as an extension (method depends on your OpenClaw setup/version).

### Option B: publish to npm

Package name is already set to `@openclaw/channel-onebot11`.

## Configuration

Add to your OpenClaw config under `channels.onebot11`.

Example (single account):

```json5
{
  channels: {
    onebot11: {
      enabled: true,
      listenHost: "0.0.0.0",
      listenPort: 3002,
      wsPath: "/onebot/v11/ws",
      accessToken: "<YOUR_TOKEN>",

      // DM-only defaults are already safe
      allowPrivate: true,
      allowGroup: false,

      includeReplyOriginal: true,
      replyMaxChars: 1200,

      maxMessageLength: 3500,
      rateLimitMs: 800,
      markdownToText: true,

      maxInboundImages: 3
    }
  }
}
```

Multi-account example (two ports):

```json5
{
  channels: {
    onebot11: {
      enabled: true,
      // default account
      listenPort: 3002,
      accessToken: "token-a",
      accounts: {
        work: {
          name: "Work QQ",
          listenPort: 3003,
          accessToken: "token-b"
        }
      }
    }
  }
}
```

## NapCatQQ (Reverse WS)

Configure NapCat OneBot v11 Reverse WebSocket (Universal) to connect:

- URL: `ws://<openclaw-host>:3002/onebot/v11/ws`
- Headers/Auth: `Authorization: Bearer <YOUR_TOKEN>`

(Exact UI names vary by NapCat build.)

## Notes

- This plugin expects OneBot messages preferably in **array segment format**.
- If your OneBot implementation does not provide direct image URLs, you may need to enable that in the protocol-side settings.

## License

MIT
