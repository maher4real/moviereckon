type ConsoleMethod = "debug" | "error" | "info" | "log" | "warn";

type SafeLoggingOptions = {
  includeStack?: boolean;
};

type SafeLoggingGlobal = typeof globalThis & {
  __moviereckonSafeLoggingInstalled?: boolean;
};

const MAX_LOG_DEPTH = 4;
const MAX_LOG_KEYS = 25;
const MAX_LOG_ARRAY_ITEMS = 20;
const MAX_LOG_STRING_LENGTH = 2000;
const REDACTED = "[REDACTED]";
const OMITTED = "[OMITTED]";
const TRUNCATED = "[TRUNCATED]";
const SENSITIVE_KEY_PATTERN =
  /(?:^|[_-])(access[_-]?token|api[_-]?key|apikey|auth|authorization|blob|captcha|client[_-]?secret|cookie|credential|jwt|key|mongodb(?:[_-]?uri)?|pass|password|private|redis|refresh[_-]?token|secret|session|set-cookie|smtp|token|turnstile)(?:$|[_-])/i;
const VISUAL_MEDIA_KEY_PATTERN =
  /(?:^|[_-])(avatar|backdrop|banner|cover|icon|image|img|logo|photo|picture|poster|screenshot|src|still|thumbnail)(?:$|[_-])/i;
const SENSITIVE_QUERY_PARAM_PATTERN =
  /^(access[_-]?token|api[_-]?key|apikey|authorization|client[_-]?secret|code|cookie|jwt|pass|password|refresh[_-]?token|secret|session|set-cookie|token)$/i;
const SENSITIVE_ASSIGNMENT_PATTERN =
  /(\b(?:access[_-]?token|api[_-]?key|apikey|authorization|blob[_-]?read[_-]?write[_-]?token|client[_-]?secret|cookie|google[_-]?client[_-]?secret|jwt[_-]?secret|mongodb[_-]?uri|pass(?:word)?|refresh[_-]?token|secret|set-cookie|smtp[_-]?(?:pass|user)|token|turnstile[_-]?secret[_-]?key|upstash[_-]?redis[_-]?rest[_-]?token)\b\s*[:=]\s*["']?)([^"',;\s]+)/gi;
const VISUAL_MEDIA_ASSIGNMENT_PATTERN =
  /(\b(?:avatar(?:_url)?|backdrop(?:_path|_url)?|banner(?:_url)?|cover(?:_url)?|icon(?:_url)?|image(?:_url)?|img|logo(?:_url)?|photo(?:_url)?|picture(?:_url)?|poster(?:_path|_url)?|screenshot(?:_url)?|src|still(?:_path|_url)?|thumbnail(?:_url)?)\b\s*[:=]\s*["']?)([^"',;\s]+)/gi;
const SENSITIVE_HEADER_PATTERN =
  /(\b(?:authorization|cookie|set-cookie)\b\s*:\s*)(.+)$/gi;
const BEARER_TOKEN_PATTERN = /(\bBearer\s+)[^\s,;]+/gi;
const BASIC_TOKEN_PATTERN = /(\bBasic\s+)[A-Za-z0-9+/=]+/gi;
const MONGODB_URI_PATTERN = /(mongodb(?:\+srv)?:\/\/)([^@\s/]+)@/gi;
const IMAGE_DATA_URL_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i;
const IMAGE_URL_OR_PATH_PATTERN =
  /^(?:(?:https?:\/\/[^\s?#]+)|(?:\/)?[^\s?#]+\.(?:png|jpe?g|webp|gif|svg|avif))(?:\?[^#\s]*)?(?:#[^\s]*)?$/i;

function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === "production";
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  return (
    SENSITIVE_KEY_PATTERN.test(normalized) ||
    VISUAL_MEDIA_KEY_PATTERN.test(normalized) ||
    normalized === "code" ||
    normalized === "headers"
  );
}

function isImageLikeString(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  if (IMAGE_DATA_URL_PATTERN.test(normalized)) return true;
  return IMAGE_URL_OR_PATH_PATTERN.test(normalized);
}

function sanitizeUrlLikeString(value: string): string {
  if (!/[?&=]/.test(value) || /\s/.test(value)) return value;

  try {
    const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
    const hasLeadingSlash = value.startsWith("/");
    const base = hasProtocol ? undefined : "https://sanitizer.invalid";
    const parsed = new URL(value, base);
    let changed = false;

    for (const key of Array.from(parsed.searchParams.keys())) {
      if (!SENSITIVE_QUERY_PARAM_PATTERN.test(key)) continue;
      parsed.searchParams.set(key, REDACTED);
      changed = true;
    }

    if (!changed) return value;
    if (hasProtocol) return parsed.toString();
    if (hasLeadingSlash) return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`.replace(/^\//, "");
  } catch {
    return value;
  }
}

function sanitizeString(value: string): string {
  let sanitized = sanitizeUrlLikeString(value);
  if (isImageLikeString(sanitized)) return REDACTED;
  sanitized = sanitized.replace(MONGODB_URI_PATTERN, `$1${REDACTED}@`);
  sanitized = sanitized.replace(BEARER_TOKEN_PATTERN, `$1${REDACTED}`);
  sanitized = sanitized.replace(BASIC_TOKEN_PATTERN, `$1${REDACTED}`);
  sanitized = sanitized.replace(SENSITIVE_HEADER_PATTERN, `$1${REDACTED}`);
  sanitized = sanitized.replace(SENSITIVE_ASSIGNMENT_PATTERN, `$1${REDACTED}`);
  sanitized = sanitized.replace(VISUAL_MEDIA_ASSIGNMENT_PATTERN, `$1${REDACTED}`);

  if (sanitized.length > MAX_LOG_STRING_LENGTH) {
    return `${sanitized.slice(0, MAX_LOG_STRING_LENGTH)} ${TRUNCATED}`;
  }

  return sanitized;
}

function sanitizeError(
  error: Error,
  options: SafeLoggingOptions,
  depth: number,
  seen: WeakSet<object>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {
    name: sanitizeString(error.name || "Error"),
    message: sanitizeString(error.message || "Unknown error"),
  };

  const maybeCode = (error as { code?: unknown }).code;
  if (typeof maybeCode === "string" || typeof maybeCode === "number") {
    output.code = sanitizeString(String(maybeCode));
  }

  const maybeStatus = (error as { status?: unknown; statusCode?: unknown }).status
    ?? (error as { statusCode?: unknown }).statusCode;
  if (typeof maybeStatus === "number") {
    output.status = maybeStatus;
  }

  if (options.includeStack && typeof error.stack === "string" && depth < MAX_LOG_DEPTH) {
    output.stack = sanitizeString(
      error.stack
        .split("\n")
        .slice(0, 10)
        .join("\n"),
    );
  }

  const errorRecord = error as unknown as Record<string, unknown>;
  for (const key of Object.keys(error)) {
    if (key in output) continue;
    output[key] = sanitizeValue(errorRecord[key], options, depth + 1, seen);
  }

  return output;
}

function sanitizeHeaders(headers: Headers, options: SafeLoggingOptions, seen: WeakSet<object>) {
  const output: Record<string, unknown> = {};
  headers.forEach((headerValue, headerKey) => {
    output[headerKey] = isSensitiveKey(headerKey)
      ? REDACTED
      : sanitizeValue(headerValue, options, 1, seen);
  });
  return output;
}

function sanitizePlainObject(
  value: Record<string, unknown>,
  options: SafeLoggingOptions,
  depth: number,
  seen: WeakSet<object>,
) {
  if (depth >= MAX_LOG_DEPTH) {
    return `[Object ${value.constructor?.name || "Object"}]`;
  }

  const output: Record<string, unknown> = {};
  const entries = Object.entries(value);
  for (const [index, [key, entryValue]] of entries.entries()) {
    if (index >= MAX_LOG_KEYS) {
      output.__truncated__ = `+${entries.length - MAX_LOG_KEYS} more keys`;
      break;
    }

    output[key] = isSensitiveKey(key)
      ? REDACTED
      : sanitizeValue(entryValue, options, depth + 1, seen);
  }

  return output;
}

function sanitizeArray(
  value: unknown[],
  options: SafeLoggingOptions,
  depth: number,
  seen: WeakSet<object>,
) {
  if (depth >= MAX_LOG_DEPTH) return `[Array(${value.length})]`;

  const output = value
    .slice(0, MAX_LOG_ARRAY_ITEMS)
    .map((item) => sanitizeValue(item, options, depth + 1, seen));

  if (value.length > MAX_LOG_ARRAY_ITEMS) {
    output.push(`+${value.length - MAX_LOG_ARRAY_ITEMS} more items`);
  }

  return output;
}

function sanitizeBinary(value: ArrayBuffer | ArrayBufferView): string {
  const byteLength = value instanceof ArrayBuffer ? value.byteLength : value.byteLength;
  return `[Binary ${byteLength} bytes]`;
}

export function sanitizeValue(
  value: unknown,
  options: SafeLoggingOptions = {},
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint" || typeof value === "symbol") return String(value);
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;

  if (value instanceof Date) return value.toISOString();
  if (value instanceof URL) return sanitizeString(value.toString());
  if (value instanceof Error) return sanitizeError(value, options, depth, seen);

  if (typeof Headers !== "undefined" && value instanceof Headers) {
    return sanitizeHeaders(value, options, seen);
  }

  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return sanitizeBinary(value as ArrayBuffer | ArrayBufferView);
  }

  if (Array.isArray(value)) {
    return sanitizeArray(value, options, depth, seen);
  }

  if (typeof value === "object") {
    if (seen.has(value as object)) return "[Circular]";
    seen.add(value as object);

    try {
      return sanitizePlainObject(value as Record<string, unknown>, options, depth, seen);
    } finally {
      seen.delete(value as object);
    }
  }

  return OMITTED;
}

export function installGlobalSafeLogging(options: SafeLoggingOptions = {}): void {
  const globalScope = globalThis as SafeLoggingGlobal;
  if (globalScope.__moviereckonSafeLoggingInstalled) return;

  const includeStack = options.includeStack ?? !isProductionEnvironment();
  const methods: ConsoleMethod[] = ["debug", "error", "info", "log", "warn"];
  const targetConsole = console as Console & Record<ConsoleMethod, (...args: unknown[]) => void>;

  for (const method of methods) {
    const originalMethod = targetConsole[method].bind(console);
    targetConsole[method] = ((...args: unknown[]) => {
      originalMethod(
        ...args.map((arg) => sanitizeValue(arg, { includeStack })),
      );
    }) as (...args: unknown[]) => void;
  }

  globalScope.__moviereckonSafeLoggingInstalled = true;
}
