import EventEmitter from "node:events";
import type { WebSocket } from "ws";
import type { OneBot11ActionRequest, OneBot11ActionResponse, OneBot11AnyEvent } from "./types.js";

export class OneBot11Connection extends EventEmitter {
  private ws: WebSocket;
  private pending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void; timer: any }>();

  constructor(ws: WebSocket) {
    super();
    this.ws = ws;

    ws.on("message", (raw) => {
      const txt = raw.toString();
      let obj: any;
      try {
        obj = JSON.parse(txt);
      } catch {
        return;
      }

      // Action response?
      if (obj && typeof obj === "object" && ("echo" in obj) && ("status" in obj || "retcode" in obj || "data" in obj)) {
        const resp = obj as OneBot11ActionResponse;
        const echo = resp.echo;
        if (echo && this.pending.has(echo)) {
          const p = this.pending.get(echo)!;
          clearTimeout(p.timer);
          this.pending.delete(echo);
          if (resp.status === "ok" || resp.retcode === 0 || resp.retcode === undefined) p.resolve(resp.data);
          else p.reject(new Error(resp.msg || resp.wording || `OneBot action failed (retcode=${resp.retcode})`));
        }
        return;
      }

      // Otherwise treat as event
      this.emit("event", obj as OneBot11AnyEvent);
    });

    ws.on("close", () => {
      this.emit("close");
      for (const [echo, p] of this.pending.entries()) {
        clearTimeout(p.timer);
        p.reject(new Error("WebSocket closed"));
        this.pending.delete(echo);
      }
    });

    ws.on("error", (err) => this.emit("error", err));
  }

  sendAction(action: string, params?: any) {
    const req: OneBot11ActionRequest = { action, params };
    if (process.env.ONEBOT11_DEBUG === "1") {
      try {
        const to = params?.user_id ?? params?.group_id ?? "?";
        let msgPreview = "";
        const m = params?.message;
        if (Array.isArray(m)) {
          const texts = m
            .filter((s: any) => s && typeof s === "object" && s.type === "text")
            .map((s: any) => String(s.data?.text ?? ""))
            .join("");
          if (texts) msgPreview = texts.slice(0, 200);
        } else if (typeof m === "string") {
          msgPreview = m.slice(0, 200);
        }
        console.log(
          `[OneBot11] sendAction action=${action} to=${String(to)}${msgPreview ? ` text=${JSON.stringify(msgPreview)}` : ""}`,
        );
      } catch {
        // ignore
      }
    }
    this.ws.send(JSON.stringify(req));
  }

  callAction<T = any>(action: string, params?: any, timeoutMs = 5000): Promise<T> {
    return new Promise((resolve, reject) => {
      const echo = Math.random().toString(36).slice(2);
      const req: OneBot11ActionRequest = { action, params, echo };
      const timer = setTimeout(() => {
        this.pending.delete(echo);
        reject(new Error("OneBot action timeout"));
      }, timeoutMs);
      this.pending.set(echo, { resolve, reject, timer });
      this.ws.send(JSON.stringify(req));
    });
  }
}
