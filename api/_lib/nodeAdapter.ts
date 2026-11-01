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
      // GET for everything, as before; only a POST with a body (Ask HQ) passes its method and body through (max 200 KB).
      let init: RequestInit = { method: "GET", headers };
      if (req.method === "POST") {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const c of req) {
          const b = Buffer.isBuffer(c) ? c : Buffer.from(c as string);
          size += b.length;
          if (size > 200_000) break;
          chunks.push(b);
        }
        let body = Buffer.concat(chunks).toString("utf8");
        const pre = (req as IncomingMessage & { body?: unknown }).body;   // a host that already read the body
        if (!body && pre !== undefined) body = typeof pre === "string" ? pre : JSON.stringify(pre);
        init = { method: "POST", headers, body };
      }
      const response = await handler(new Request(`${proto}://${host}${req.url || "/"}`, init));
      const body = Buffer.from(await response.arrayBuffer());
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.setHeader("Content-Length", String(body.length));      // the whole body at once with its length: never chunked
      res.end(body);
    } catch {
      res.statusCode = 500;
      res.setHeader("Cache-Control", "no-store");
      res.end();
    }
  };
}
