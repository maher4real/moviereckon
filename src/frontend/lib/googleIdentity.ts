const GOOGLE_IDENTITY_SCRIPT_ID = "moviereckon-google-identity";
const GOOGLE_IDENTITY_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

let googleIdentityScriptPromise: Promise<void> | null = null;

export type GoogleCredentialResponse = {
  credential: string;
  select_by?: string;
};

export type GooglePromptMomentNotification = {
  getDismissedReason?: () => string;
  getNotDisplayedReason?: () => string;
  getSkippedReason?: () => string;
  isDismissedMoment?: () => boolean;
  isNotDisplayed?: () => boolean;
  isSkippedMoment?: () => boolean;
};

type GoogleIdApi = {
  cancel: () => void;
  disableAutoSelect: () => void;
  initialize: (config: {
    auto_select?: boolean;
    callback: (response: GoogleCredentialResponse) => void | Promise<void>;
    cancel_on_tap_outside?: boolean;
    client_id: string;
    context?: "signin" | "signup" | "use";
    itp_support?: boolean;
    nonce?: string;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      locale?: string;
      logo_alignment?: "center" | "left";
      shape?: "circle" | "pill" | "rectangular" | "square";
      size?: "large" | "medium" | "small";
      text?:
        | "continue_with"
        | "signin"
        | "signup_with"
        | "signin_with"
        | "continue_with";
      theme?: "filled_black" | "filled_blue" | "outline";
      type?: "icon" | "standard";
      width?: number | string;
    },
  ) => void;
  prompt: (listener?: (notification: GooglePromptMomentNotification) => void) => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleIdApi;
      };
    };
  }
}

export async function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.google?.accounts?.id) return;
  if (googleIdentityScriptPromise) return googleIdentityScriptPromise;

  googleIdentityScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_IDENTITY_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Identity script")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_IDENTITY_SCRIPT_ID;
    script.src = GOOGLE_IDENTITY_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity script"));
    document.head.appendChild(script);
  }).catch((error) => {
    googleIdentityScriptPromise = null;
    throw error;
  });

  return googleIdentityScriptPromise;
}

export function cancelGoogleOneTapPrompt(): void {
  window.google?.accounts?.id?.cancel();
}

export function disableGoogleAutoSelect(): void {
  window.google?.accounts?.id?.disableAutoSelect();
}
