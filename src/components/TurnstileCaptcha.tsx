import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

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
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
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
  action: "login" | "signup";
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
  const [loadError, setLoadError] = useState<string>("");
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let canceled = false;
    onTokenChange("");

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
            callback: (token) => onTokenChange(token),
            "expired-callback": () => onTokenChange(""),
            "error-callback": () => onTokenChange(""),
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
  }, [action, onTokenChange, retryNonce, siteKey]);

  useEffect(() => {
    if (!window.turnstile || !widgetIdRef.current) return;
    window.turnstile.reset(widgetIdRef.current);
    onTokenChange("");
  }, [onTokenChange, resetNonce]);

  const handleRetry = () => {
    onTokenChange("");
    setLoadError("");
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
      <div ref={containerRef} className="min-h-[65px]" />
      {loadError ? (
        <div className="space-y-2">
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
