import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

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
  }
}

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile-script="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Turnstile")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.turnstileScript = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Turnstile"));
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

        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          callback: (token) => onTokenChange(token),
          "expired-callback": () => onTokenChange(""),
          "error-callback": () => onTokenChange(""),
        });
      })
      .catch((error) => {
        console.error("Turnstile script error:", error);
        if (!canceled) {
          setLoadError("Unable to load CAPTCHA. Please refresh and try again.");
        }
      });

    return () => {
      canceled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [action, onTokenChange, siteKey]);

  useEffect(() => {
    if (!window.turnstile || !widgetIdRef.current) return;
    window.turnstile.reset(widgetIdRef.current);
    onTokenChange("");
  }, [onTokenChange, resetNonce]);

  return (
    <div className={cn("space-y-2", className)}>
      <div ref={containerRef} className="min-h-[65px]" />
      {loadError ? <p className="text-xs text-destructive">{loadError}</p> : null}
    </div>
  );
}
