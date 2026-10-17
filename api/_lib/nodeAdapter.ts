// api/_lib/nodeAdapter.ts — runs a Web-standard handler (Request -> Response) as a Vercel Node.js function (req, res).
import type { IncomingMessage, ServerResponse } from "node:http";

export function toNodeHandler(handler: (request: Request) => Promise<Response>) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const first = (v: string | string[] | undefined) => String(Array.isArray(v) ? v[0] : v ?? "").split(",")[0].trim();
      const proto = first(req.headers["x-forwarded-proto"]) || "https";
      const host = first(req.headers["x-forwarded-host"]) || first(req.headers.host) || "localhost";
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
      const response = await handler(new Request(`${proto}://${host}${req.url || "/"}`, { method: "GET", headers }));
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.statusCode = 500;
      res.setHeader("Cache-Control", "no-store");
      res.end();
    }
  };
}
