// For local type-check/build without depending on OpenClaw internals at install time.
// At runtime, OpenClaw provides this module.

declare module "openclaw/plugin-sdk" {
  export type OpenClawPluginApi = any;
  export type PluginRuntime = any;

  export const emptyPluginConfigSchema: any;

  export const DEFAULT_ACCOUNT_ID: string;

  export type ChannelAccountSnapshot = any;
  export type ReplyPayload = any;
  export type ChannelPlugin<TAccount = any> = any;

  export function buildChannelConfigSchema(schema: any): any;
  export function normalizeAccountId(id: any): any;

  export function applyAccountNameToChannelSection(args: any): any;
  export function migrateBaseNameToDefaultAccount(args: any): any;
}
