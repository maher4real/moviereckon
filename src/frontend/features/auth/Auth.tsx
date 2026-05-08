import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/frontend/hooks/useAuth";
import * as mongoClient from "@/frontend/lib/mongodbClient";
import {
  getTrendingMovies,
  getTrendingTVShows,
  getBollywoodMovies,
  getPosterUrl,
} from "@/shared/lib/tmdb";
import BrandLogo from "@/frontend/components/BrandLogo";
import TurnstileCaptcha from "@/frontend/components/TurnstileCaptcha";
import { Alert, AlertDescription, AlertTitle } from "@/frontend/components/ui/alert";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/frontend/components/ui/tabs";
import MediaImage from "@/frontend/components/MediaImage";
import {
  ArrowRight,
  CircleAlert,
  CircleCheckBig,
  Eye,
  EyeOff,
  LoaderCircle,
  Lock,
  Mail,
  MailCheck,
  User,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import {
  primeStartupSoundFromGesture,
  queueStartupSound,
  warmStartupSound,
} from "@/frontend/lib/startupSound";
import {
  emailSchema,
  signinPasswordSchema,
  signupPasswordSchema,
  usernameSchema,
} from "@/shared/lib/authValidation";
import {
  cancelGoogleOneTapPrompt,
  loadGoogleIdentityScript,
} from "@/frontend/lib/googleIdentity";

type VerificationBannerState = {
  tone: "success" | "error" | "info";
  message: string;
};

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    user,
    isLoading,
    isAuthenticating,
    signUp,
    signIn,
    resendVerificationEmail,
    signInWithGoogle,
    signInWithGoogleOneTap,
    triggerAuthTransition,
  } = useAuth();
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [signinCaptchaToken, setSigninCaptchaToken] = useState("");
  const [signupCaptchaToken, setSignupCaptchaToken] = useState("");
  const [signinCaptchaResetNonce, setSigninCaptchaResetNonce] = useState(0);
  const [signupCaptchaResetNonce, setSignupCaptchaResetNonce] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [verificationBanner, setVerificationBanner] = useState<VerificationBannerState | null>(null);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [debouncedSignupEmail, setDebouncedSignupEmail] = useState("");
  const [debouncedSignupUsername, setDebouncedSignupUsername] = useState("");
  const [googlePromptError, setGooglePromptError] = useState("");
  const [isGoogleIdentityReady, setIsGoogleIdentityReady] = useState(false);
  const googleOneTapPromptedRef = useRef(false);
  const googleOneTapSigningInRef = useRef(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const captchaSiteKey = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim();

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const normalizedEmail = email.trim();
  const normalizedUsername = username.trim();

  const { data: trendingMovies } = useQuery({
    queryKey: ["trending-movies"],
    queryFn: () => getTrendingMovies("week"),
    staleTime: 1000 * 60 * 10,
  });

  const { data: trendingTV } = useQuery({
    queryKey: ["trending-tv-week"],
    queryFn: () => getTrendingTVShows("week"),
    staleTime: 1000 * 60 * 10,
  });

  const { data: bollywoodData } = useQuery({
    queryKey: ["bollywood-movies"],
    queryFn: () => getBollywoodMovies(),
    staleTime: 1000 * 60 * 10,
  });

  const backgroundPosters = useMemo(() => {
    const maxItems = 36;

    const moviePosters = (trendingMovies || [])
      .filter((item) => item.poster_path)
      .map((item, index) => ({
        id: `movie-${item.id}-${index}`,
        src: getPosterUrl(item.poster_path, "small"),
      }));

    const tvPosters = (trendingTV || [])
      .filter((item) => item.poster_path)
      .map((item, index) => ({
        id: `tv-${item.id}-${index}`,
        src: getPosterUrl(item.poster_path, "small"),
      }));

    const bollywoodPosters = (bollywoodData?.results || [])
      .filter((item) => item.poster_path)
      .map((item, index) => ({
        id: `bollywood-${item.id}-${index}`,
        src: getPosterUrl(item.poster_path, "small"),
      }));

    // Keep background balanced: movies + series dominant, limited Bollywood accent.
    const curatedPools = {
      movie: moviePosters.slice(0, 16),
      tv: tvPosters.slice(0, 16),
      bollywood: bollywoodPosters.slice(0, 10),
    };

    const orderedKeys: (keyof typeof curatedPools)[] = [
      "movie",
      "tv",
      "bollywood",
    ];
    const mixed: { id: string; src: string }[] = [];
    let cursor = 0;

    while (
      mixed.length < maxItems &&
      orderedKeys.some((key) => cursor < curatedPools[key].length)
    ) {
      orderedKeys.forEach((key) => {
        if (mixed.length >= maxItems) return;
        const item = curatedPools[key][cursor];
        if (item) mixed.push(item);
      });
      cursor += 1;
    }

    if (mixed.length < maxItems) {
      const extraPool = [
        ...moviePosters.slice(16),
        ...tvPosters.slice(16),
        ...bollywoodPosters.slice(10),
      ];
      for (const item of extraPool) {
        if (mixed.length >= maxItems) break;
        mixed.push(item);
      }
    }

    if (mixed.length > 0) {
      // Shuffle the final list to prevent noticeable patterns
      return [...mixed].sort(() => Math.random() - 0.5);
    }

    return Array.from({ length: 36 }, (_, index) => ({
      id: `fallback-${index}`,
      src: "/fallbacks/poster.svg",
    }));
  }, [bollywoodData, trendingMovies, trendingTV]);

  const posterRows = useMemo(() => {
    const rowCount = 4;
    const postersPerRow = 9;
    const total = backgroundPosters.length || 1;

    return Array.from({ length: rowCount }, (_, rowIndex) => {
      // Ensure each row gets a completely distinct slice of posters
      const start = (rowIndex * postersPerRow) % total;
      return Array.from({ length: postersPerRow }, (_, offset) => {
        return backgroundPosters[(start + offset) % total];
      });
    });
  }, [backgroundPosters]);

  const oauthErrorMessage = useMemo(() => {
    const code = new URLSearchParams(location.search).get("oauth_error");
    if (!code) return "";

    const codeToMessage: Record<string, string> = {
      access_denied: "Google sign-in was canceled.",
      invalid_oauth_state: "Google sign-in expired. Please try again.",
      email_not_verified: "Your Google account email must be verified to continue.",
      google_account_conflict: "This email is already linked to a different Google account.",
      google_oauth_unavailable: "Google sign-in is not configured on the server yet.",
      too_many_requests: "Too many Google sign-in attempts. Please wait and try again.",
      token_exchange_failed: "Google sign-in could not be completed. Please try again.",
      userinfo_fetch_failed: "Unable to fetch your Google account details. Please try again.",
      profile_incomplete: "Google did not return enough profile information.",
      google_callback_failed: "Google sign-in failed. Please try again.",
    };

    return codeToMessage[code] || "Google sign-in failed. Please try again.";
  }, [location.search]);

  const emailVerificationStatus = useMemo(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("email_verified") === "1") {
      return {
        code: "email_verified",
        tone: "success" as const,
        message: "Email verified successfully. You can sign in now.",
      };
    }
    return null;
  }, [location.search]);

  const { data: googleOneTapConfig } = useQuery({
    queryKey: ["google-one-tap-config"],
    queryFn: () => mongoClient.getGoogleOneTapConfig(),
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: !user,
  });

  // Redirect if already authenticated
  useEffect(() => {
    if (user) {
      navigate("/home", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    warmStartupSound();
  }, []);

  useEffect(() => {
    if (!emailVerificationStatus) return;
    setActiveTab("signin");

    if (emailVerificationStatus.tone === "success") {
      setPendingVerificationEmail("");
      setVerificationBanner(null);
    }
  }, [emailVerificationStatus]);

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
                setPendingVerificationEmail("");
                setVerificationBanner(null);
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

  useEffect(() => {
    if (activeTab !== "signup") {
      setDebouncedSignupEmail("");
      setDebouncedSignupUsername("");
      return;
    }

    const emailValid = emailSchema.safeParse(normalizedEmail).success;
    const usernameValid = usernameSchema.safeParse(normalizedUsername).success;

    if (!emailValid && !usernameValid) {
      setDebouncedSignupEmail("");
      setDebouncedSignupUsername("");
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDebouncedSignupEmail(emailValid ? normalizedEmail : "");
      setDebouncedSignupUsername(usernameValid ? normalizedUsername : "");
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [activeTab, normalizedEmail, normalizedUsername]);

  const { data: signupAvailability, isFetching: isCheckingSignupAvailability } = useQuery({
    queryKey: ["signup-availability", debouncedSignupEmail, debouncedSignupUsername],
    queryFn: () =>
      mongoClient.checkRegistrationAvailability({
        email: debouncedSignupEmail,
        username: debouncedSignupUsername,
      }),
    enabled:
      activeTab === "signup" &&
      Boolean(debouncedSignupEmail || debouncedSignupUsername),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const isCurrentEmailAvailability =
    debouncedSignupEmail.length > 0 && debouncedSignupEmail === normalizedEmail;
  const isCurrentUsernameAvailability =
    debouncedSignupUsername.length > 0 &&
    debouncedSignupUsername === normalizedUsername;

  const availabilityErrors = useMemo(() => {
    if (activeTab !== "signup") return {};

    const nextErrors: Record<string, string> = {};
    if (isCurrentUsernameAvailability && signupAvailability?.username_exists) {
      nextErrors.username = "Username already taken";
    }
    if (isCurrentEmailAvailability && signupAvailability?.email_exists) {
      nextErrors.email = "Email already registered";
    }
    return nextErrors;
  }, [
    activeTab,
    isCurrentEmailAvailability,
    isCurrentUsernameAvailability,
    signupAvailability,
  ]);

  const displayErrors = useMemo(
    () => ({ ...availabilityErrors, ...errors }),
    [availabilityErrors, errors],
  );

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    const emailResult = emailSchema.safeParse(normalizedEmail);
    if (!emailResult.success) {
      newErrors.email = emailResult.error.issues[0]?.message || "Invalid email";
    }

    const passwordResult =
      activeTab === "signup"
        ? signupPasswordSchema.safeParse(password)
        : signinPasswordSchema.safeParse(password);
    if (!passwordResult.success) {
      newErrors.password = passwordResult.error.issues[0]?.message || "Invalid password";
    }

    if (activeTab === "signup") {
      const usernameResult = usernameSchema.safeParse(normalizedUsername);
      if (!usernameResult.success) {
        newErrors.username = usernameResult.error.issues[0]?.message || "Invalid username";
      }
      if (isCurrentUsernameAvailability && signupAvailability?.username_exists) {
        newErrors.username = "Username already taken";
      }
      if (isCurrentEmailAvailability && signupAvailability?.email_exists) {
        newErrors.email = "Email already registered";
      }
    }

    if (!captchaSiteKey) {
      newErrors.captcha = "CAPTCHA is unavailable. Please contact support.";
    } else if (activeTab === "signup" && !signupCaptchaToken) {
      newErrors.captcha = "Please complete CAPTCHA verification.";
    } else if (activeTab === "signin" && !signinCaptchaToken) {
      newErrors.captcha = "Please complete CAPTCHA verification.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const clearError = (field: string) => {
    setErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleResendVerification = async () => {
    const targetEmail = pendingVerificationEmail || normalizedEmail;
    const emailResult = emailSchema.safeParse(targetEmail);

    if (!emailResult.success) {
      setErrors((current) => ({
        ...current,
        email: "Enter the email address for the account you want to verify.",
      }));
      return;
    }

    setIsResendingVerification(true);

    try {
      const { error } = await resendVerificationEmail(targetEmail);

      if (!error) {
        setPendingVerificationEmail(targetEmail);
        setVerificationBanner({
          tone: "success",
          message: `Verification email sent to ${targetEmail}.`,
        });
      }
    } finally {
      setIsResendingVerification(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    // Prime audio in direct user gesture path to reduce autoplay delays after navigation.
    void primeStartupSoundFromGesture();

    setIsSubmitting(true);

    try {
      if (activeTab === "signup") {
        const {
          error,
          requiresEmailVerification,
        } = await signUp(email, password, username, signupCaptchaToken);
        setSignupCaptchaToken("");
        setSignupCaptchaResetNonce((prev) => prev + 1);

        if (!error) {
          if (requiresEmailVerification) {
            setPendingVerificationEmail(normalizedEmail);
            setVerificationBanner({
              tone: "info",
              message: `Account created. Check ${normalizedEmail} and verify your email before signing in.`,
            });
            setPassword("");
            setShowPassword(false);
            setActiveTab("signin");
            setSigninCaptchaToken("");
            setSigninCaptchaResetNonce((prev) => prev + 1);
            return;
          }

          setPendingVerificationEmail("");
          setVerificationBanner(null);
          triggerAuthTransition();
          queueStartupSound();
          navigate("/home");
        }
      } else {
        const { error, code } = await signIn(email, password, signinCaptchaToken);
        setSigninCaptchaToken("");
        setSigninCaptchaResetNonce((prev) => prev + 1);

        if (code === "email_not_verified") {
          setPendingVerificationEmail(normalizedEmail);
          setVerificationBanner({
            tone: "info",
            message: `Verify ${normalizedEmail} using the email we sent you before signing in.`,
          });
          return;
        }

        if (!error) {
          setPendingVerificationEmail("");
          setVerificationBanner(null);
          triggerAuthTransition();
          queueStartupSound();
          navigate("/home");
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

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

  const canPromptResendVerification =
    activeTab === "signin" && pendingVerificationEmail.length > 0;
  const resendVerificationMessage = verificationBanner?.message
    || (pendingVerificationEmail
      ? `Check ${pendingVerificationEmail} for the verification link, then come back here to sign in.`
      : "Enter your email and password to request another verification email.");
  const resendVerificationHint = "We limit resend requests to one email per minute.";
  const combinedGoogleErrorMessage = googlePromptError || oauthErrorMessage;

  const showCard = !isLoading && !user;

  return (
    <div className="app-page relative min-h-screen overflow-hidden">
      {/* Poster carousel — always rendered so queries fire immediately */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 scale-[1.08] -rotate-2">
          <div
            className="flex h-full flex-col justify-center gap-3 opacity-64"
            style={{ filter: "saturate(1.16) contrast(1.06) brightness(0.9)" }}
          >
            {posterRows.map((row, rowIndex) => (
              <div
                key={`row-${rowIndex}`}
                className={cn(
                  "auth-poster-row",
                  rowIndex % 2 === 1 && "auth-poster-row-reverse",
                )}
                style={{ animationDuration: `${34 + rowIndex * 4}s` }}
              >
                {[...row, ...row].map((poster, index) => (
                  <div
                    key={`${poster.id}-${rowIndex}-${index}`}
                    className="auth-poster-tile"
                  >
                    <MediaImage
                      src={poster.src}
                      alt=""
                      aria-hidden="true"
                      className="h-full w-full object-cover"
                      fallbackSrc="/fallbacks/poster.svg"
                      loading="eager"
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="absolute inset-0 bg-black/22" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_22%,hsl(var(--secondary)/0.22),transparent_42%),radial-gradient(circle_at_84%_74%,hsl(var(--primary)/0.26),transparent_45%)]" />
        <div className="absolute inset-0 bg-linear-to-br from-background/70 via-background/45 to-background/65" />
        <div className="absolute inset-0 opacity-30 [background-image:repeating-linear-gradient(90deg,transparent_0,transparent_54px,hsl(var(--foreground)/0.04)_55px,hsl(var(--foreground)/0.04)_56px)]" />
      </div>

      <div className="relative z-10 flex min-h-screen w-full items-center justify-center p-4">
        {showCard ? (
          <div className="w-full max-w-md animate-fade-in">
            <div className="mb-8 flex flex-col items-center">
              <div className="mb-4 flex justify-center">
                <BrandLogo size="xl" animated={isSubmitting || isGoogleSubmitting || isAuthenticating} />
              </div>
              <p className="text-center text-muted-foreground">
                Your personalized gateway to Bollywood & Hollywood
              </p>
            </div>

            <section className="surface-panel px-8 py-9 ring-1 ring-inset ring-white/10">
            {emailVerificationStatus ? (
              <Alert
                className={cn(
                  "mb-5 rounded-xl border px-3 py-2",
                  "border-emerald-500/40 bg-emerald-500/10 text-emerald-100 [&>svg]:text-emerald-300",
                )}
              >
                <CircleCheckBig className="h-4 w-4" />
                <AlertTitle>Email verified</AlertTitle>
                <AlertDescription>{emailVerificationStatus.message}</AlertDescription>
              </Alert>
            ) : null}

            {combinedGoogleErrorMessage ? (
              <p className="mb-5 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {combinedGoogleErrorMessage}
              </p>
            ) : null}

            <div className="mb-1">
              <div
                ref={googleButtonRef}
                className={cn(
                  "mx-auto flex min-h-12 w-full max-w-[360px] items-center justify-center",
                  isGoogleIdentityReady ? "" : "hidden",
                )}
              />

              {!isGoogleIdentityReady ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full cursor-pointer rounded-xl border-border/30 bg-white text-sm font-semibold text-slate-900 shadow-sm transition-colors duration-150 hover:bg-white/95"
                  onClick={handleGoogleSignIn}
                  disabled={isSubmitting || isGoogleSubmitting || isAuthenticating}
                >
                  <span className="inline-flex items-center gap-3">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      className="h-5 w-5"
                      aria-hidden="true"
                    >
                      <path fill="#FFC107" d="M43.61 20.08H42V20H24v8h11.3A12 12 0 0 1 12 24 12 12 0 0 1 24 12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66A19.92 19.92 0 0 0 24 4C12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.34-.14-2.65-.39-3.92" />
                      <path fill="#FF3D00" d="M6.31 14.69 12.88 19.5A11.96 11.96 0 0 1 24 12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66A19.92 19.92 0 0 0 24 4 19.99 19.99 0 0 0 6.31 14.69" />
                      <path fill="#4CAF50" d="M24 44c5.2 0 9.93-1.99 13.49-5.23l-6.23-5.27A11.95 11.95 0 0 1 24 36a12 12 0 0 1-11.28-7.8l-6.52 5.02A20 20 0 0 0 24 44" />
                      <path fill="#1976D2" d="M43.61 20.08H42V20H24v8h11.3a12.03 12.03 0 0 1-4.04 5.5l6.23 5.27C36.99 39.03 44 34 44 24c0-1.34-.14-2.65-.39-3.92" />
                    </svg>
                    {isGoogleSubmitting ? "Redirecting..." : "Sign in with Google"}
                  </span>
                </Button>
              ) : null}
            </div>

            <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
              <span className="h-px flex-1 bg-white/15" />
              <span>or continue with email</span>
              <span className="h-px flex-1 bg-white/15" />
            </div>

            <Tabs
              value={activeTab}
              onValueChange={(value) => {
                const nextTab = value as "signin" | "signup";
                setActiveTab(nextTab);
                setErrors({});
                setGooglePromptError("");
                setSigninCaptchaToken("");
                setSignupCaptchaToken("");
                setSigninCaptchaResetNonce((prev) => prev + 1);
                setSignupCaptchaResetNonce((prev) => prev + 1);
              }}
            >
              <TabsList className="mb-6 grid h-11 w-full grid-cols-2 rounded-xl border border-white/10 bg-background/60 p-1">
                <TabsTrigger
                  value="signin"
                  className="rounded-lg text-sm font-semibold tracking-wide transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/35 data-[state=inactive]:text-muted-foreground"
                >
                  Sign In
                </TabsTrigger>
                <TabsTrigger
                  value="signup"
                  className="rounded-lg text-sm font-semibold tracking-wide transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/35 data-[state=inactive]:text-muted-foreground"
                >
                  Sign Up
                </TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="mt-0">
                {canPromptResendVerification ? (
                  <Alert className="mb-4 rounded-xl border-primary/25 bg-primary/10 text-primary-foreground [&>svg]:text-primary">
                    <MailCheck className="h-4 w-4" />
                    <AlertTitle>Verify your email</AlertTitle>
                    <AlertDescription className="space-y-3">
                      <p>{resendVerificationMessage}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="brand-primary-button rounded-lg font-semibold hover:brightness-110"
                          onClick={handleResendVerification}
                          disabled={isSubmitting || isAuthenticating || isResendingVerification}
                        >
                          {isResendingVerification ? (
                            <span className="inline-flex items-center gap-2">
                              <LoaderCircle className="h-4 w-4 animate-spin" />
                              Sending...
                            </span>
                          ) : (
                            "Resend verification email"
                          )}
                        </Button>
                        <span className="text-xs text-primary-foreground/80">
                          {resendVerificationHint}
                        </span>
                      </div>
                    </AlertDescription>
                  </Alert>
                ) : null}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email" className="text-xs font-semibold tracking-wide text-foreground/75">
                      Email Address
                    </Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="signin-email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => {
                          const nextEmail = e.target.value;
                          setEmail(nextEmail);
                          clearError("email");
                          if (
                            pendingVerificationEmail &&
                            nextEmail.trim().toLowerCase() !== pendingVerificationEmail.toLowerCase()
                          ) {
                            setPendingVerificationEmail("");
                          }
                          if (verificationBanner) {
                            setVerificationBanner(null);
                          }
                        }}
                        className="h-12 rounded-xl border-border/50 bg-background/60 pl-10 pr-3 text-sm transition-colors duration-150 focus-visible:border-primary/50 focus-visible:ring-primary/20"
                        autoComplete="email"
                      />
                    </div>
                    {displayErrors.email && (
                      <p className="flex items-center gap-1.5 text-xs text-destructive">
                        <CircleAlert className="h-3 w-3 shrink-0" />
                        {displayErrors.email}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signin-password" className="text-xs font-semibold tracking-wide text-foreground/75">
                      Password
                    </Label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="signin-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          clearError("password");
                        }}
                        className="h-12 rounded-xl border-border/50 bg-background/60 pl-10 pr-10 text-sm transition-colors duration-150 focus-visible:border-primary/50 focus-visible:ring-primary/20"
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="flex items-center gap-1.5 text-xs text-destructive">
                        <CircleAlert className="h-3 w-3 shrink-0" />
                        {errors.password}
                      </p>
                    )}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => navigate("/forgot-password")}
                        className="cursor-pointer text-xs font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                  </div>

                  <TurnstileCaptcha
                    siteKey={captchaSiteKey}
                    action="login"
                    onTokenChange={(token) => {
                      setSigninCaptchaToken(token);
                      clearError("captcha");
                    }}
                    resetNonce={signinCaptchaResetNonce}
                  />
                  {errors.captcha && activeTab === "signin" ? (
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                      <CircleAlert className="h-3 w-3 shrink-0" />
                      {errors.captcha}
                    </p>
                  ) : null}

                  <Button
                    type="submit"
                    className="auth-submit-btn brand-primary-button relative mt-1 h-12 w-full rounded-xl text-base font-semibold shadow-lg shadow-primary/35 transition-all hover:brightness-110"
                    disabled={isSubmitting || isAuthenticating}
                  >
                    {isSubmitting && <span className="auth-btn-loading-fill" aria-hidden="true" />}
                    <span className="relative z-10 inline-flex items-center gap-2">
                      {isSubmitting ? "Signing In..." : "Sign In"}
                      {!isSubmitting && <ArrowRight className="h-4 w-4" />}
                    </span>
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-0">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-username" className="text-xs font-semibold tracking-wide text-foreground/75">
                      Username
                    </Label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="signup-username"
                        type="text"
                        placeholder="Pick a username"
                        value={username}
                        onChange={(e) => {
                          setUsername(e.target.value);
                          clearError("username");
                        }}
                        className="h-12 rounded-xl border-border/50 bg-background/60 pl-10 pr-3 text-sm transition-colors duration-150 focus-visible:border-primary/50 focus-visible:ring-primary/20"
                        autoComplete="name"
                      />
                    </div>
                    {displayErrors.username && (
                      <p className="flex items-center gap-1.5 text-xs text-destructive">
                        <CircleAlert className="h-3 w-3 shrink-0" />
                        {displayErrors.username}
                      </p>
                    )}
                    {!displayErrors.username &&
                    activeTab === "signup" &&
                    isCheckingSignupAvailability &&
                    debouncedSignupUsername ? (
                      <p className="text-xs text-muted-foreground">Checking username...</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-email" className="text-xs font-semibold tracking-wide text-foreground/75">
                      Email Address
                    </Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          clearError("email");
                          setVerificationBanner(null);
                        }}
                        className="h-12 rounded-xl border-border/50 bg-background/60 pl-10 pr-3 text-sm transition-colors duration-150 focus-visible:border-primary/50 focus-visible:ring-primary/20"
                        autoComplete="email"
                      />
                    </div>
                    {displayErrors.email && (
                      <p className="flex items-center gap-1.5 text-xs text-destructive">
                        <CircleAlert className="h-3 w-3 shrink-0" />
                        {displayErrors.email}
                      </p>
                    )}
                    {!displayErrors.email &&
                    activeTab === "signup" &&
                    isCheckingSignupAvailability &&
                    debouncedSignupEmail ? (
                      <p className="text-xs text-muted-foreground">Checking email...</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-xs font-semibold tracking-wide text-foreground/75">
                      Password
                    </Label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="At least 10 characters"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          clearError("password");
                        }}
                        className="h-12 rounded-xl border-border/50 bg-background/60 pl-10 pr-10 text-sm transition-colors duration-150 focus-visible:border-primary/50 focus-visible:ring-primary/20"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="flex items-center gap-1.5 text-xs text-destructive">
                        <CircleAlert className="h-3 w-3 shrink-0" />
                        {errors.password}
                      </p>
                    )}
                  </div>

                  <TurnstileCaptcha
                    siteKey={captchaSiteKey}
                    action="signup"
                    onTokenChange={(token) => {
                      setSignupCaptchaToken(token);
                      clearError("captcha");
                    }}
                    resetNonce={signupCaptchaResetNonce}
                  />
                  {errors.captcha && activeTab === "signup" ? (
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                      <CircleAlert className="h-3 w-3 shrink-0" />
                      {errors.captcha}
                    </p>
                  ) : null}

                  <Button
                    type="submit"
                    className="auth-submit-btn brand-primary-button relative mt-1 h-12 w-full rounded-xl text-base font-semibold shadow-lg shadow-primary/35 transition-all hover:brightness-110"
                    disabled={
                      isSubmitting ||
                      isAuthenticating ||
                      Boolean(availabilityErrors.email || availabilityErrors.username)
                    }
                  >
                    {isSubmitting && <span className="auth-btn-loading-fill" aria-hidden="true" />}
                    <span className="relative z-10 inline-flex items-center gap-2">
                      {isSubmitting ? "Creating Account..." : "Create Account"}
                      {!isSubmitting && <ArrowRight className="h-4 w-4" />}
                    </span>
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </section>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Discover movies from Bollywood, Hollywood & more
          </p>
        </div>
        ) : (
          <div className="flex flex-col items-center gap-6 animate-fade-in">
            <BrandLogo size="xl" animated />
            <p className="text-center text-muted-foreground text-sm">
              Your personalized gateway to Bollywood & Hollywood
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
