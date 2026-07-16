const allowedOriginsEnv = process.env.CLIP_API_ALLOWED_ORIGINS ?? "";

function normalizeOrigins(values: Array<string | undefined>) {
  return values.map((value) => value?.trim()).filter(Boolean) as string[];
}

const clipWriteAllowedOrigins = normalizeOrigins([
  process.env.AUTH_URL,
  process.env.NEXTAUTH_URL,
  ...allowedOriginsEnv.split(","),
]);

type CorsOptions = {
  methods?: string[];
  allowHeaders?: string[];
};

// 許可エントリは完全一致に加え、"<scheme>://*" 形式のスキーム全体ワイルドカードを許可する。
// 例: "chrome-extension://*" で任意の拡張オリジンを許可（開発用途）。
// 任意プレフィックス一致は web オリジンでサフィックス混同
// （https://app.example.com* が https://app.example.com.evil.com に一致）を招くため採用しない。
// また "*" 単体もワイルドカードとして扱わない（全オリジン開放事故の防止）。
// 注意: link-token / session など Cookie セッション認証のルートがこのチェックを使うため、
// 本番では具体的な拡張IDの登録を推奨。
function originMatches(pattern: string, origin: string) {
  if (pattern === origin) return true;
  if (pattern.endsWith("://*")) {
    const scheme = pattern.slice(0, -1); // 例: "chrome-extension://"
    const rest = origin.slice(scheme.length);
    // scheme 一致 かつ 残りが空でなく "/" を含まない（= host のみ）
    return origin.startsWith(scheme) && rest.length > 0 && !rest.includes("/");
  }
  return false;
}

export function isAllowedClipWriteOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return clipWriteAllowedOrigins.some((pattern) =>
    originMatches(pattern, origin),
  );
}

export function buildClipWriteCorsHeaders(
  request: Request,
  options: CorsOptions = {},
) {
  const origin = request.headers.get("origin");
  const methods = options.methods ?? ["POST", "OPTIONS"];
  const allowHeaders = options.allowHeaders ?? ["Content-Type"];
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": methods.join(", "),
    "Access-Control-Allow-Headers": allowHeaders.join(", "),
    Vary: "Origin",
  };

  if (origin && isAllowedClipWriteOrigin(request)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}

export function buildExtensionCorsHeaders(
  request: Request,
  options: CorsOptions = {},
) {
  return buildClipWriteCorsHeaders(request, {
    methods: options.methods ?? ["GET", "POST", "OPTIONS"],
    allowHeaders: options.allowHeaders ?? ["Content-Type", "Authorization"],
  });
}
