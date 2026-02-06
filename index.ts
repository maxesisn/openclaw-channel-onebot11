import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { onebot11Channel } from "./src/channel.js";
import { setOneBot11Runtime } from "./src/runtime.js";

const plugin = {
  id: "onebot11",
  name: "OneBot v11 (Reverse WS)",
  description: "OneBot v11 channel plugin (Reverse WebSocket, DM-only)",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setOneBot11Runtime(api.runtime);
    api.registerChannel({ plugin: onebot11Channel });
  },
};

export default plugin;
