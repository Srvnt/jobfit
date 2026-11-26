import type { IncomingMessage } from "node:http";
import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** Serves api/fetch-page.ts during `npm run dev`, the same way Vercel does in production. */
function apiDevServer(): Plugin {
  return {
    name: "api-dev-server",
    configureServer(server) {
      server.middlewares.use("/api/fetch-page", async (req, res) => {
        try {
          const api = await server.ssrLoadModule("/api/fetch-page.ts");
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(key, value);
          const request = new Request(`http://localhost${req.originalUrl ?? req.url}`, {
            method: req.method,
            headers,
            body: req.method === "POST" ? new Uint8Array(await readBody(req)) : undefined,
          });
          const response: Response = await (req.method === "POST" ? api.POST : api.GET)(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          server.config.logger.error(String(err));
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Dev server error" }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiDevServer()],
  base: "./",
  test: {
    include: ["src/**/*.test.ts"],
    // Test the same mammoth build the browser gets (the Node build reads files, not ArrayBuffers).
    alias: { mammoth: "mammoth/mammoth.browser.js" },
  },
});
