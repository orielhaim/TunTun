import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";

import { apiV1 } from "./api/v1";
import { auth } from "./auth";

const port = Number(process.env.MANAGEMENT_PORT ?? 3000);
const webOrigin = process.env.MANAGEMENT_WEB_ORIGIN ?? "http://localhost:5173";

const app = new Elysia()
  .use(
    cors({
      origin: webOrigin,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Organization-Id",
        "Cache-Control",
      ],
    }),
  )
  .mount(auth.handler)
  .use(apiV1)
  .get("/health", () => ({ status: "ok" }))
  .listen(port);

console.log(
  `TunTun management server running at ${app.server?.hostname}:${app.server?.port}`,
);
