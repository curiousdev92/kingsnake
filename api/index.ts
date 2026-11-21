import type { IncomingMessage, ServerResponse } from "node:http";
import { authSecret, internalKey } from "../packages/auth/src/index";
import { buildApp } from "../apps/api/src/app";
import { createPostgresDb, migrate } from "../apps/api/src/db";

let appPromise: ReturnType<typeof buildApp> | undefined;

async function getApp(): ReturnType<typeof buildApp> {
  if (!appPromise) {
    const pending = (async () => {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) throw new Error("DATABASE_URL is not configured");

      const db = await createPostgresDb(connectionString);
      try {
        await migrate(db);
        const origins = new Set(["https://kingsnake.vercel.app"]);
        for (const host of [
          process.env.VERCEL_URL,
          process.env.VERCEL_PROJECT_PRODUCTION_URL,
        ]) {
          if (host) origins.add(host.startsWith("http") ? host : `https://${host}`);
        }

        const app = await buildApp({
          db,
          authSecret: authSecret(),
          internalKey: internalKey(),
          corsOrigin: [...origins],
        });
        await app.ready();
        return app;
      } catch (error) {
        await db.close();
        throw error;
      }
    })();
    appPromise = pending.catch((error: unknown) => {
      appPromise = undefined;
      throw error;
    });
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    const route = requestUrl.searchParams.get("__path");
    if (!route || !route.startsWith("/") || route.startsWith("//")) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "bad_request", message: "Invalid API path" }));
      return;
    }

    requestUrl.searchParams.delete("__path");
    req.url = `${route}${requestUrl.search}`;
    const app = await getApp();
    app.server.emit("request", req, res);
  } catch {
    res.statusCode = 503;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "service_unavailable", message: "API unavailable" }));
  }
}
