type RedisArgument = string | number | boolean;

type RedisResponseEnvelope<T = unknown> = {
  result?: T;
  error?: string;
};

export type RedisCommandResult<T = unknown> = {
  ok: boolean;
  result: T | null;
  error: string | null;
};

function readEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function getRedisConfig() {
  const url = readEnv("UPSTASH_REDIS_REST_URL");
  const token = readEnv("UPSTASH_REDIS_REST_TOKEN");
  const timeoutMs = Math.max(300, Number(process.env.UPSTASH_REDIS_TIMEOUT_MS || 1500));
  return {
    url: url.replace(/\/+$/, ""),
    token,
    timeoutMs,
  };
}

export function isRedisConfigured(): boolean {
  const { url, token } = getRedisConfig();
  return url.length > 0 && token.length > 0;
}

function normalizeArgument(value: unknown): RedisArgument {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return JSON.stringify(value);
}

export function getRedisKey(input: string): string {
  const prefix = readEnv("APP_REDIS_PREFIX") || "moviereckon";
  return `${prefix}:${input}`;
}

export async function runRedisCommand<T = unknown>(
  command: unknown[],
): Promise<RedisCommandResult<T>> {
  if (!isRedisConfigured()) {
    return { ok: false, result: null, error: "redis_not_configured" };
  }

  const { url, token, timeoutMs } = getRedisConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${url}/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        command: command.map((item) => normalizeArgument(item)),
      }),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => ({}))) as RedisResponseEnvelope<T>;

    if (!response.ok || payload.error) {
      return {
        ok: false,
        result: null,
        error: payload.error || `redis_http_${response.status}`,
      };
    }

    return {
      ok: true,
      result: (payload.result as T | undefined) ?? null,
      error: null,
    };
  } catch (error) {
    const errorCode =
      error instanceof Error && error.name === "AbortError"
        ? "redis_request_timeout"
        : "redis_request_failed";
    return {
      ok: false,
      result: null,
      error: errorCode,
    };
  } finally {
    clearTimeout(timeout);
  }
}
