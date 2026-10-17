import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as mongoClient from "@/frontend/lib/mongodbClient";
import { primeStartupSoundFromGesture } from "@/frontend/lib/startupSound";
import {
  cancelGoogleOneTapPrompt,
  loadGoogleIdentityScript,
} from "@/frontend/lib/googleIdentity";

interface GoogleSignInOptions {
  activeTab: "signin" | "signup";
  hasUser: boolean;
  isLoading: boolean;
  signInWithGoogle: () => Promise<unknown>;
  signInWithGoogleOneTap: (credential: string) => Promise<{ error: { message: string } | null }>;
  triggerAuthTransition: () => void;
  /** Called after a successful One Tap sign-in so the form can drop stale banners. */
  onOneTapSignedIn: () => void;
}

/** Google One Tap + redirect sign-in: script loading, prompt lifecycle and error state. */
export function useGoogleSignIn({
  activeTab,
  hasUser,
  isLoading,
  signInWithGoogle,
  signInWithGoogleOneTap,
  triggerAuthTransition,
  onOneTapSignedIn,
}: GoogleSignInOptions) {
  const user = hasUser;
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [googlePromptError, setGooglePromptError] = useState("");
  const [isGoogleIdentityReady, setIsGoogleIdentityReady] = useState(false);
  const googleOneTapPromptedRef = useRef(false);
  const googleOneTapSigningInRef = useRef(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const onSignedInRef = useRef(onOneTapSignedIn);
  useEffect(() => {
    onSignedInRef.current = onOneTapSignedIn;
  }, [onOneTapSignedIn]);

  const { data: googleOneTapConfig } = useQuery({
    queryKey: ["google-one-tap-config"],
    queryFn: () => mongoClient.getGoogleOneTapConfig(),
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: !user,
  });

  useEffect(() => {
    if (activeTab !== "signin" || user || isLoading) {
      cancelGoogleOneTapPrompt();
      setIsGoogleIdentityReady(false);
      googleOneTapPromptedRef.current = false;
      return;
    }

    if (
      !googleOneTapConfig?.enabled ||
      !googleOneTapConfig.client_id ||
      !googleOneTapConfig.nonce ||
      googleOneTapPromptedRef.current
    ) {
      return;
    }

    let cancelled = false;
    const googleClientId = googleOneTapConfig.client_id;
    const googleNonce = googleOneTapConfig.nonce;
    if (!googleClientId || !googleNonce) {
      googleOneTapPromptedRef.current = false;
      return;
    }
    googleOneTapPromptedRef.current = true;

    void (async () => {
      try {
        await loadGoogleIdentityScript();
        if (cancelled) return;

        const googleIdApi = window.google?.accounts?.id;
        if (!googleIdApi) {
          setIsGoogleIdentityReady(false);
          googleOneTapPromptedRef.current = false;
          return;
        }

        setIsGoogleIdentityReady(true);
        googleIdApi.cancel();
        googleIdApi.initialize({
          client_id: googleClientId,
          nonce: googleNonce,
          callback: async (response) => {
            if (
              cancelled ||
              googleOneTapSigningInRef.current ||
              typeof response.credential !== "string" ||
              response.credential.length === 0
            ) {
              return;
            }

            googleOneTapSigningInRef.current = true;
            setGooglePromptError("");
            setIsGoogleSubmitting(true);

            try {
              const { error } = await signInWithGoogleOneTap(response.credential);
              if (!error) {
                onSignedInRef.current();
                triggerAuthTransition();
              } else {
                setGooglePromptError(error.message);
              }
            } finally {
              googleOneTapSigningInRef.current = false;
              setIsGoogleSubmitting(false);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
          context: "signin",
          itp_support: true,
        });

        if (googleButtonRef.current) {
          googleButtonRef.current.innerHTML = "";
          googleIdApi.renderButton(googleButtonRef.current, {
            type: "standard",
            theme: "outline",
            size: "large",
            shape: "pill",
            text: "signin_with",
            width: 360,
            logo_alignment: "left",
          });
        }

        googleIdApi.prompt((notification) => {
          if (cancelled) return;

          if (notification.isNotDisplayed?.()) {
            const reason = notification.getNotDisplayedReason?.() || "not_displayed";
            if (
              reason === "opt_out_or_no_session" ||
              reason === "suppressed_by_user" ||
              reason === "browser_not_supported"
            ) {
              return;
            }

            if (reason === "unregistered_origin") {
              setGooglePromptError("Google sign-in is not allowed for this site origin yet.");
              return;
            }

            if (reason === "invalid_client" || reason === "missing_client_id") {
              setGooglePromptError("Google sign-in is not configured correctly on the server.");
              return;
            }

            if (reason === "secure_http_required") {
              setGooglePromptError("Google One Tap requires HTTPS on this origin.");
              return;
            }

            return;
          }
        });
      } catch {
        setIsGoogleIdentityReady(false);
        googleOneTapPromptedRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      cancelGoogleOneTapPrompt();
    };
  }, [
    activeTab,
    googleOneTapConfig?.client_id,
    googleOneTapConfig?.enabled,
    googleOneTapConfig?.nonce,
    isLoading,
    signInWithGoogleOneTap,
    triggerAuthTransition,
    user,
  ]);

  const handleGoogleSignIn = async () => {
    void primeStartupSoundFromGesture();
    cancelGoogleOneTapPrompt();
    setGooglePromptError("");
    setIsGoogleSubmitting(true);

    try {
      await signInWithGoogle();
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  return {
    googleButtonRef,
    isGoogleIdentityReady,
    isGoogleSubmitting,
    googlePromptError,
    setGooglePromptError,
    handleGoogleSignIn,
  };
}
