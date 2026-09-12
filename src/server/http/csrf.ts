import { ForbiddenError } from "@/server/http/errors";

/** Cookie-authenticated v1 writes are only intended for the site's own origin. */
export function assertSameOriginWrite(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return;

  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  // AUTH_URL is the public URL when Next.js runs behind a reverse proxy.
  const siteOrigin = new URL(
    process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? request.url,
  ).origin;

  if (
    fetchSite === "cross-site" ||
    (origin !== null && origin !== siteOrigin) ||
    (origin === null && fetchSite !== null && fetchSite !== "same-origin")
  ) {
    throw new ForbiddenError(
      "Cross-origin write not allowed",
      "ORIGIN_NOT_ALLOWED",
    );
  }
  // Non-browser callers may omit both headers. JSON body parsing additionally
  // requires application/json, so a simple HTML form cannot take this path.
}
