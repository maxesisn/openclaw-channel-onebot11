import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setOneBot11Runtime(next: PluginRuntime) {
  runtime = next;
}

export function getOneBot11Runtime(): PluginRuntime {
  if (!runtime) throw new Error("OneBot11 runtime not initialized");
  return runtime;
}
