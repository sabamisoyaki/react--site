import type { NextRequest } from "next/server";
import { assertSameOriginWrite } from "@/server/http/csrf";
import { toErrorPayload } from "@/server/http/errors";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

export type HttpMethod = (typeof METHODS)[number];

/**
 * ルート実装側（あなたが普段使う context）
 * params は「普通のオブジェクト」
 */
export interface RouteContext<
  Params extends Record<string, string | string[]> = Record<
    string,
    string | string[]
  >,
> {
  params: Params;
}

/**
 * Next.js が内部で使っている context イメージ
 * params が Promise になっているのがポイント
 */
type NextRouteContext<
  Params extends Record<string, string | string[]> = Record<
    string,
    string | string[]
  >,
> = {
  params: Params | Promise<Params>;
};

/**
 * あなたが書くハンドラの型
 * （params は「ただのオブジェクト」として扱える）
 */
export type ApiHandler<
  Params extends Record<string, string | string[]> = Record<
    string,
    string | string[]
  >,
> = (
  req: NextRequest,
  context: RouteContext<Params>,
) => Promise<Response> | Response;

/**
 * Next にエクスポートされる実際のハンドラの型
 * （validator.ts が期待している形）
 */
type NextApiHandler<
  Params extends Record<string, string | string[]> = Record<
    string,
    string | string[]
  >,
> = (
  req: NextRequest,
  context: NextRouteContext<Params>,
) => Promise<Response> | Response;

export type HandlerMap<Params extends Record<string, string | string[]>> =
  Partial<Record<HttpMethod, ApiHandler<Params>>>;

function isHttpMethod(value: string): value is HttpMethod {
  return (METHODS as readonly string[]).includes(value);
}

/**
 * HandlerMap（自前ハンドラ群）から
 * Next.js が期待する型のハンドラ（NextApiHandler）を作る
 */
export function createApiHandler<
  Params extends Record<string, string | string[]> = Record<
    string,
    string | string[]
  >,
>(handlers: HandlerMap<Params>): NextApiHandler<Params> {
  const allowHeader = METHODS.filter(
    (m) => typeof handlers[m] === "function",
  ).join(", ");
  const isDevelopment = process.env.NODE_ENV !== "production";

  // ここが Next.js から直接呼ばれるハンドラ
  return async function handler(
    req: NextRequest,
    nextContext: NextRouteContext<Params>,
  ) {
    // Next の Promise<Params> を解決して、
    // 自前の RouteContext 形式に変換
    const context: RouteContext<Params> = {
      params: await nextContext.params,
    };

    const methodRaw = req.method.toUpperCase();

    // 未知のメソッドは 405（Allow が分かるなら付ける）
    if (!isHttpMethod(methodRaw)) {
      return new Response(null, {
        status: 405,
        headers: allowHeader ? { Allow: allowHeader } : undefined,
      });
    }

    const method: HttpMethod = methodRaw; // ここから先は HttpMethod として扱える

    const fn = handlers[method];
    if (!fn) {
      return new Response(null, {
        status: 405,
        headers: allowHeader ? { Allow: allowHeader } : undefined,
      });
    }

    try {
      assertSameOriginWrite(req);
      return await fn(req, context);
    } catch (error) {
      const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
      const { status, body } = toErrorPayload(error, {
        exposeDetails: isDevelopment,
      });

      console.error("API handler error", {
        requestId,
        method: req.method,
        path: req.nextUrl.pathname,
        status,
        code: body.code,
        error,
      });

      return Response.json(body, {
        status,
        headers: { "x-request-id": requestId },
      });
    }
  };
}

/**
 * { GET, POST, ... } みたいな形で複数メソッドをまとめて export するヘルパー
 * 返り値の型は NextApiHandler になる（＝Next の期待どおり）
 */
export function createRouteHandlers<
  Params extends Record<string, string | string[]> = Record<
    string,
    string | string[]
  >,
  H extends HandlerMap<Params> = HandlerMap<Params>,
>(handlers: H): { [K in keyof H]: NextApiHandler<Params> } {
  const apiHandler = createApiHandler<Params>(handlers);

  const exports: { [K in keyof H]: NextApiHandler<Params> } = {} as {
    [K in keyof H]: NextApiHandler<Params>;
  };

  for (const method of Object.keys(handlers) as (keyof H)[]) {
    const fn = handlers[method];
    if (typeof fn === "function") {
      exports[method] = apiHandler;
    }
  }

  return exports;
}
