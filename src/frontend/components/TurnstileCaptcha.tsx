import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/utils";

const TURNSTILE_SCRIPT_ID = "moviereckon-turnstile-script";
const TURNSTILE_ONLOAD_CALLBACK = "__moviereckonTurnstileOnLoad";
const TURNSTILE_SCRIPT_SRC =
  `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=${TURNSTILE_ONLOAD_CALLBACK}`;
const SCRIPT_LOAD_TIMEOUT_MS = 15_000;

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          action?: string;
          appearance?: "always" | "execute" | "interaction-only";
          execution?: "render" | "execute";
          size?: "normal" | "flexible" | "compact";
          theme?: "light" | "dark" | "auto";
          retry?: "auto" | "never";
          "retry-interval"?: number;
          "refresh-expired"?: "auto" | "manual" | "never";
          "refresh-timeout"?: "auto" | "manual" | "never";
          "response-field"?: boolean;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          "timeout-callback"?: () => void;
          "before-interactive-callback"?: () => void;
          "after-interactive-callback"?: () => void;
          "unsupported-callback"?: () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
    __moviereckonTurnstileOnLoad?: () => void;
  }
}

let turnstileScriptPromise: Promise<void> | null = null;
let turnstileScriptResolve: (() => void) | null = null;
let turnstileScriptReject: ((reason?: unknown) => void) | null = null;

function resetTurnstileLoaderState() {
  turnstileScriptPromise = null;
  turnstileScriptResolve = null;
  turnstileScriptReject = null;
}

function removeExistingTurnstileScript() {
  const existing = document.getElementById(TURNSTILE_SCRIPT_ID);
  if (existing) {
    existing.remove();
  }
  resetTurnstileLoaderState();
}

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise((resolve, reject) => {
    turnstileScriptResolve = resolve;
    turnstileScriptReject = reject;

    const timeout = window.setTimeout(() => {
      reject(new Error("Turnstile script load timed out"));
      removeExistingTurnstileScript();
    }, SCRIPT_LOAD_TIMEOUT_MS);

    const safeResolve = () => {
      window.clearTimeout(timeout);
      resolve();
    };

    const safeReject = (reason: unknown) => {
      window.clearTimeout(timeout);
      reject(reason);
      removeExistingTurnstileScript();
    };

    window[TURNSTILE_ONLOAD_CALLBACK] = () => {
      if (window.turnstile) {
        safeResolve();
      } else {
        safeReject(new Error("Turnstile onload fired but API is unavailable"));
      }
    };

    const existing = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      // If script tag exists but global is still missing, force a clean reload.
      if (!window.turnstile) {
        existing.remove();
      } else {
        safeResolve();
        return;
      }
    }

    const script = document.createElement("script");
    script.id = TURNSTILE_SCRIPT_ID;
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onerror = () => safeReject(new Error("Failed to load Turnstile script"));
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

type TurnstileCaptchaProps = {
  siteKey: string;
  action: "login" | "signup" | "forgot-password";
  onTokenChange: (token: string) => void;
  resetNonce: number;
  className?: string;
};

export default function TurnstileCaptcha({
  siteKey,
  action,
  onTokenChange,
  resetNonce,
  className,
}: TurnstileCaptchaProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  const [loadError, setLoadError] = useState<string>("");
  const [retryNonce, setRetryNonce] = useState(0);
  const [isInteractiveChallengeVisible, setIsInteractiveChallengeVisible] = useState(false);

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    let canceled = false;
    onTokenChangeRef.current("");
    setIsInteractiveChallengeVisible(false);

    if (!siteKey) {
      setLoadError("CAPTCHA site key is missing.");
      return () => undefined;
    }

    setLoadError("");

    loadTurnstileScript()
      .then(() => {
        if (canceled || !containerRef.current || !window.turnstile) return;

        if (widgetIdRef.current) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }

        try {
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            action,
            appearance: "always",
            execution: "render",
            size: "flexible",
            theme: "dark",
            retry: "auto",
            "refresh-expired": "auto",
            "refresh-timeout": "auto",
            "response-field": false,
            callback: (token) => onTokenChangeRef.current(token),
            "expired-callback": () => {
              setIsInteractiveChallengeVisible(false);
              onTokenChangeRef.current("");
            },
            "error-callback": () => {
              setIsInteractiveChallengeVisible(false);
              onTokenChangeRef.current("");
            },
            "timeout-callback": () => {
              setIsInteractiveChallengeVisible(false);
              onTokenChangeRef.current("");
            },
            "before-interactive-callback": () => setIsInteractiveChallengeVisible(true),
            "after-interactive-callback": () => setIsInteractiveChallengeVisible(false),
            "unsupported-callback": () => {
              setIsInteractiveChallengeVisible(false);
              setLoadError("This browser could not load CAPTCHA verification. Please update it and try again.");
            },
          });
        } catch (renderError) {
          console.error("Turnstile render error:", renderError);
          setLoadError(
            "Unable to initialize CAPTCHA. Check Turnstile site key/hostname settings and retry.",
          );
        }
      })
      .catch((error) => {
        console.error("Turnstile script error:", error);
        if (!canceled) {
          setLoadError(
            "Unable to load CAPTCHA. Disable blockers and verify Turnstile hostname settings.",
          );
        }
      });

    return () => {
      canceled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [action, retryNonce, siteKey]);

  useEffect(() => {
    if (!window.turnstile || !widgetIdRef.current) return;
    window.turnstile.reset(widgetIdRef.current);
    setIsInteractiveChallengeVisible(false);
    onTokenChangeRef.current("");
  }, [resetNonce]);

  const handleRetry = () => {
    onTokenChangeRef.current("");
    setLoadError("");
    setIsInteractiveChallengeVisible(false);
    if (typeof window !== "undefined") {
      removeExistingTurnstileScript();
      try {
        delete window.turnstile;
      } catch {
        // no-op
      }
    }
    setRetryNonce((prev) => prev + 1);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className={cn(
          "rounded-xl border bg-background/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm transition-colors",
          loadError ? "border-destructive/35 bg-destructive/5" : "border-white/12",
        )}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
              Security Check
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Complete the CAPTCHA to continue.
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-background/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Protected
          </div>
        </div>

        <div
          className={cn(
            "overflow-hidden rounded-lg border bg-black/20 px-2 py-2 transition-[border-color,box-shadow,background-color] duration-200 sm:px-3",
            loadError ? "border-destructive/25 bg-destructive/5" : "border-white/10",
            isInteractiveChallengeVisible ? "ring-1 ring-primary/25" : "",
          )}
        >
          <div
            ref={containerRef}
            className="mx-auto flex min-h-[66px] w-full items-center justify-center [&_iframe]:max-w-full"
          />
        </div>
      </div>
      {loadError ? (
        <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
          <p className="text-xs text-destructive">{loadError}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="text-xs font-semibold text-primary underline underline-offset-2"
          >
            Retry CAPTCHA
          </button>
        </div>
      ) : null}
    </div>
  );
}
