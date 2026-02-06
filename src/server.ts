import http from "node:http";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { OneBot11Connection } from "./onebot_client.js";

export type OneBot11ServerOptions = {
  host: string;
  port: number;
  path: string;
  accessToken?: string;
};

export class OneBot11ReverseWSServer {
  private server: http.Server;
  private wss: WebSocketServer;

  constructor(private opts: OneBot11ServerOptions) {
    this.server = http.createServer();
    this.wss = new WebSocketServer({ server: this.server, path: this.opts.path });
  }

  onConnection(handler: (conn: OneBot11Connection, req: http.IncomingMessage) => void) {
    this.wss.on("connection", (ws: WebSocket, req) => {
      // Token auth
      if (this.opts.accessToken) {
        const auth = req.headers["authorization"];
        const ok = typeof auth === "string" && auth.trim() === `Bearer ${this.opts.accessToken}`;
        if (!ok) {
          ws.close(1008, "Unauthorized");
          return;
        }
      }

      handler(new OneBot11Connection(ws), req);
    });
  }

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.opts.port, this.opts.host, () => resolve());
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.clients.forEach((c) => c.close());
      this.server.close(() => resolve());
    });
  }
}
