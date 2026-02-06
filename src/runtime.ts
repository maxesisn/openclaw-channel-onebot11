import type { PluginRuntime } from "openclaw/plugin-sdk";
import type { OneBot11Connection } from "./onebot_client.js";

let runtime: PluginRuntime | null = null;

// Track active Reverse-WS connections per account so gateway-level outbound
// (including slash-command responses) can send messages.
const connections = new Map<string, OneBot11Connection>();

export function setOneBot11Runtime(next: PluginRuntime) {
  runtime = next;
}

export function getOneBot11Runtime(): PluginRuntime {
  if (!runtime) throw new Error("OneBot11 runtime not initialized");
  return runtime;
}

const DEBUG = process.env.ONEBOT11_DEBUG === "1";

export function setOneBot11Connection(accountId: string, conn: OneBot11Connection | null) {
  if (!conn) {
    connections.delete(accountId);
    if (DEBUG) console.log(`[OneBot11] connection cleared (accountId=${accountId})`);
  } else {
    connections.set(accountId, conn);
    if (DEBUG) console.log(`[OneBot11] connection set (accountId=${accountId})`);
  }
}

export function getOneBot11Connection(accountId: string): OneBot11Connection | null {
  return connections.get(accountId) ?? null;
}
