import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

/*
 * Shared turn-based games for Lunar, keyed by a join code like "LUNAR-482917".
 *   GET  /api/game/:code              -> { game, etag }          (404 if unknown)
 *   PUT  /api/game/:code { game, etag } -> { etag }               (create when etag is null)
 *        409 { game, etag } when the stored game changed since `etag` (the other phone moved).
 *        403 { game, etag } when the update would hand a player that another phone already
 *        claimed (game.claims[playerId] = deviceId) to a different phone. Freeing a seat is allowed.
 * The app lives on GitHub Pages, so this function answers cross-origin requests from it.
 */

const ALLOWED_ORIGINS = new Set([
  "https://lncerimi.github.io",
  "http://localhost:8765",
]);
const CODE_RE = /^LUNAR-[0-9]{6}$/;
const MAX_BYTES = 200_000;

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  if (!ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(req) },
  });

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });

  const code = String(context.params.code || "").toUpperCase();
  if (!CODE_RE.test(code)) return json(req, { error: "Bad game code" }, 400);

  const store = getStore({ name: "lunar-games", consistency: "strong" });
  const key = `games/${code}`;

  if (req.method === "GET") {
    const entry = await store.getWithMetadata(key, { type: "json" });
    if (entry === null) return json(req, { error: "No game with that code" }, 404);
    return json(req, { game: entry.data, etag: entry.etag });
  }

  if (req.method === "PUT") {
    const text = await req.text();
    if (text.length > MAX_BYTES) return json(req, { error: "Game too large" }, 413);
    let body: { game?: unknown; etag?: string | null };
    try { body = JSON.parse(text); } catch { return json(req, { error: "Invalid JSON" }, 400); }
    const game = body.game;
    if (!game || typeof game !== "object" || Array.isArray(game)) return json(req, { error: "Missing game" }, 400);

    if (body.etag) {
      const current = await store.getWithMetadata(key, { type: "json" });
      if (current === null) return json(req, { error: "No game with that code" }, 404);
      if (current.etag !== body.etag) {
        return json(req, { error: "Game changed", game: current.data, etag: current.etag }, 409);
      }
      // Seat locking: a claimed player can be freed, but not moved to another phone.
      const before = ((current.data as { claims?: Record<string, string> })?.claims) || {};
      const after = ((game as { claims?: Record<string, string> }).claims) || {};
      for (const pid of Object.keys(before)) {
        if (after[pid] !== undefined && after[pid] !== before[pid]) {
          return json(req, { error: "That player is already taken on another phone", game: current.data, etag: current.etag }, 403);
        }
      }
    }

    const payload = JSON.stringify({ ...(game as object), updatedAt: Date.now() });
    const opts = body.etag ? { onlyIfMatch: body.etag } : { onlyIfNew: true };
    const res = await store.set(key, payload, opts);
    if (!res.modified) {
      const current = await store.getWithMetadata(key, { type: "json" });
      return json(req, { error: "Game changed", game: current?.data ?? null, etag: current?.etag ?? null }, 409);
    }
    return json(req, { etag: res.etag });
  }

  return json(req, { error: "Method not allowed" }, 405);
};

export const config: Config = {
  path: "/api/game/:code",
  method: ["GET", "PUT", "OPTIONS"],
};
