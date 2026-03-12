import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import * as mongoClient from "@/lib/mongodbClient";
import {
  getTrendingMovies,
  getTrendingTVShows,
  getBollywoodMovies,
  getPosterUrl,
} from "@/lib/tmdb";
import { AuthPageSkeleton } from "@/components/AppSkeletons";
import BrandLogo from "@/components/BrandLogo";
import TurnstileCaptcha from "@/components/TurnstileCaptcha";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import MediaImage from "@/components/MediaImage";
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
import { z } from "zod";
import { cn } from "@/lib/utils";
import {
  primeStartupSoundFromGesture,
  queueStartupSound,
  warmStartupSound,
} from "@/lib/startupSound";

const emailSchema = z.string().email("Please enter a valid email address");
const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(100, "Password is too long")
  .regex(/[A-Z]/, "Password must include at least one uppercase letter")
  .regex(/[a-z]/, "Password must include at least one lowercase letter")
  .regex(/[0-9]/, "Password must include at least one number");
const usernameSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9_]{3,24}$/,
    "Username must be 3-24 characters and only include letters, numbers, and underscores",
  );

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
  const [pendingVerificationProvider, setPendingVerificationProvider] =
    useState<mongoClient.EmailVerificationProvider>("internal");
  const [verificationBanner, setVerificationBanner] = useState<VerificationBannerState | null>(null);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [debouncedSignupEmail, setDebouncedSignupEmail] = useState("");
  const [debouncedSignupUsername, setDebouncedSignupUsername] = useState("");
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
    const maxItems = 24;

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
      movie: moviePosters.slice(0, 14),
      tv: tvPosters.slice(0, 14),
      bollywood: bollywoodPosters.slice(0, 8),
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
        ...moviePosters.slice(14),
        ...tvPosters.slice(14),
        ...bollywoodPosters.slice(8),
      ];
      for (const item of extraPool) {
        if (mixed.length >= maxItems) break;
        mixed.push(item);
      }
    }

    if (mixed.length > 0) return mixed;

    return Array.from({ length: 24 }, (_, index) => ({
      id: `fallback-${index}`,
      src: "/fallbacks/poster.svg",
    }));
  }, [bollywoodData, trendingMovies, trendingTV]);

  const posterRows = useMemo(() => {
    if (!backgroundPosters.length) return [];

    const rowCount = 3;
    const postersPerRow = 8;

    return Array.from({ length: rowCount }, (_, rowIndex) => {
      const start = (rowIndex * 6) % backgroundPosters.length;
      return Array.from({ length: postersPerRow }, (_, offset) => {
        return backgroundPosters[(start + offset) % backgroundPosters.length];
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

    const verifyError = params.get("verify_error");
    if (!verifyError) return null;

    const codeToMessage: Record<string, string> = {
      missing_token: "Verification link is incomplete.",
      invalid_token: "Verification link is invalid.",
      expired_token: "Verification link expired. Request a new verification email.",
      user_not_found: "Account not found for this verification link.",
      server_error: "Verification failed due to a server issue.",
    };

    return {
      code: verifyError,
      tone: "error" as const,
      message: codeToMessage[verifyError] || "Email verification failed. Please try again.",
    };
  }, [location.search]);

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
      setPendingVerificationProvider("internal");
      setVerificationBanner(null);
    }
  }, [emailVerificationStatus]);

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

    const passwordResult = passwordSchema.safeParse(password);
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

    if (!captchaSiteKey) {
      setErrors((current) => ({
        ...current,
        captcha: "CAPTCHA is unavailable. Please contact support.",
      }));
      return;
    }

    if (!signinCaptchaToken) {
      setErrors((current) => ({
        ...current,
        captcha: "Complete CAPTCHA before requesting a new verification email.",
      }));
      return;
    }

    if (pendingVerificationProvider === "firebase" && password.trim().length === 0) {
      setErrors((current) => ({
        ...current,
        password: "Enter your password to resend the Firebase verification email.",
      }));
      return;
    }

    setIsResendingVerification(true);

    try {
      const { error, verificationPreviewUrl } = await resendVerificationEmail(
        targetEmail,
        password,
        signinCaptchaToken,
        pendingVerificationProvider,
      );

      if (!error) {
        setPendingVerificationEmail(targetEmail);
        setVerificationBanner({
          tone: "success",
          message: `Verification email sent to ${targetEmail}.`,
        });
        if (verificationPreviewUrl) {
          console.info("Verification preview URL:", verificationPreviewUrl);
        }
      }
    } finally {
      setSigninCaptchaToken("");
      setSigninCaptchaResetNonce((prev) => prev + 1);
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
          verificationPreviewUrl,
          verificationProvider,
        } = await signUp(email, password, username, signupCaptchaToken);
        setSignupCaptchaToken("");
        setSignupCaptchaResetNonce((prev) => prev + 1);

        if (!error) {
          if (requiresEmailVerification) {
            setPendingVerificationEmail(normalizedEmail);
            setPendingVerificationProvider(verificationProvider);
            setVerificationBanner({
              tone: "info",
              message: `Account created. Check ${normalizedEmail} and verify your email before signing in.`,
            });
            setPassword("");
            setShowPassword(false);
            setActiveTab("signin");
            setSigninCaptchaToken("");
            setSigninCaptchaResetNonce((prev) => prev + 1);
            if (verificationPreviewUrl) {
              console.info("Verification preview URL:", verificationPreviewUrl);
            }
            return;
          }

          setPendingVerificationEmail("");
          setPendingVerificationProvider("internal");
          setVerificationBanner(null);
          triggerAuthTransition();
          queueStartupSound();
          navigate("/home");
        }
      } else {
        const { error, code, verificationProvider } = await signIn(email, password, signinCaptchaToken);
        setSigninCaptchaToken("");
        setSigninCaptchaResetNonce((prev) => prev + 1);

        if (code === "email_not_verified") {
          setPendingVerificationEmail(normalizedEmail);
          setPendingVerificationProvider(verificationProvider || "internal");
          setVerificationBanner({
            tone: "info",
            message:
              verificationProvider === "firebase"
                ? `Verify ${normalizedEmail} using the Firebase email we sent you before signing in.`
                : `Verify ${normalizedEmail} before signing in.`,
          });
          return;
        }

        if (!error) {
          setPendingVerificationEmail("");
          setPendingVerificationProvider("internal");
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
    setIsGoogleSubmitting(true);

    try {
      await signInWithGoogle();
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  const canPromptResendVerification =
    activeTab === "signin" &&
    (pendingVerificationEmail.length > 0 || emailVerificationStatus?.code === "expired_token");
  const resendVerificationMessage = verificationBanner?.message
    || (pendingVerificationEmail
      ? `Check ${pendingVerificationEmail} for the verification link, then come back here to sign in.`
      : "This verification link expired. Enter your email, complete CAPTCHA, and request a fresh link.");
  const resendVerificationHint =
    pendingVerificationProvider === "firebase"
      ? "Enter your password and complete CAPTCHA below before resending."
      : "Complete CAPTCHA below before resending.";

  if (user) {
    // Avoid blank first paint while the redirect effect navigates to /home.
    return <AuthPageSkeleton />;
  }

  if (isLoading) {
    return <AuthPageSkeleton />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background p-4">
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
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="absolute inset-0 bg-black/22" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_22%,hsl(var(--secondary)/0.22),transparent_42%),radial-gradient(circle_at_84%_74%,hsl(var(--primary)/0.26),transparent_45%)]" />
        <div className="absolute inset-0 bg-linear-to-br from-background/68 via-background/44 to-background/62" />
        <div className="absolute top-1/4 -left-1/4 h-1/2 w-1/2 rounded-full bg-primary/16 blur-[120px]" />
        <div className="absolute bottom-1/4 -right-1/4 h-1/2 w-1/2 rounded-full bg-secondary/18 blur-[120px]" />
      </div>

      <div className="relative z-10 flex min-h-screen w-full items-center justify-center">
        <div className="w-full max-w-md animate-fade-in">
          <div className="mb-8 flex flex-col items-center">
            <div className="mb-4 flex justify-center">
              <BrandLogo size="xl" animated={isSubmitting || isGoogleSubmitting || isAuthenticating || isLoading} />
            </div>
            <p className="text-center text-muted-foreground">
              Your personalized gateway to Bollywood & Hollywood
            </p>
          </div>

          <section className="rounded-2xl border border-white/10 bg-card/78 p-8 shadow-2xl backdrop-blur-md">
            {emailVerificationStatus ? (
              <Alert
                variant={emailVerificationStatus.tone === "error" ? "destructive" : "default"}
                className={cn(
                  "mb-5 rounded-xl border px-3 py-2",
                  emailVerificationStatus.tone === "success"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100 [&>svg]:text-emerald-300"
                    : "border-destructive/40 bg-destructive/10 text-destructive",
                )}
              >
                {emailVerificationStatus.tone === "success" ? (
                  <CircleCheckBig className="h-4 w-4" />
                ) : (
                  <CircleAlert className="h-4 w-4" />
                )}
                <AlertTitle>
                  {emailVerificationStatus.tone === "success" ? "Email verified" : "Verification issue"}
                </AlertTitle>
                <AlertDescription>{emailVerificationStatus.message}</AlertDescription>
              </Alert>
            ) : null}

            {oauthErrorMessage ? (
              <p className="mb-5 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {oauthErrorMessage}
              </p>
            ) : null}

            <Button
              type="button"
              variant="outline"
              className="h-12 w-full rounded-xl border-white/20 bg-background/75 text-sm font-semibold transition-colors hover:bg-background"
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
                {isGoogleSubmitting ? "Redirecting..." : "Continue with Google"}
              </span>
            </Button>

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
                setSigninCaptchaToken("");
                setSignupCaptchaToken("");
                setSigninCaptchaResetNonce((prev) => prev + 1);
                setSignupCaptchaResetNonce((prev) => prev + 1);
              }}
            >
              <TabsList className="mb-6 grid h-12 w-full grid-cols-2 rounded-xl border border-white/10 bg-background/65 p-1">
                <TabsTrigger
                  value="signin"
                  className="rounded-lg text-sm font-semibold tracking-wide data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-primary/35"
                >
                  Sign In
                </TabsTrigger>
                <TabsTrigger
                  value="signup"
                  className="rounded-lg text-sm font-semibold tracking-wide data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-primary/35"
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
                          className="rounded-lg bg-gradient-to-r from-primary via-red-500 to-orange-500 text-white hover:brightness-110"
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
                    <Label htmlFor="signin-email" className="text-sm font-medium">
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
                            setPendingVerificationProvider("internal");
                          }
                          if (verificationBanner) {
                            setVerificationBanner(null);
                          }
                        }}
                        className="h-12 rounded-xl border-white/15 bg-background/80 pl-10 pr-3 text-sm"
                        autoComplete="email"
                      />
                    </div>
                    {displayErrors.email && (
                      <p className="text-xs text-destructive">{displayErrors.email}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signin-password" className="text-sm font-medium">
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
                        className="h-12 rounded-xl border-white/15 bg-background/80 pl-10 pr-10 text-sm"
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
                      <p className="text-xs text-destructive">
                        {errors.password}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="auth-submit-btn mt-1 h-12 w-full rounded-xl bg-gradient-to-r from-primary via-red-500 to-orange-500 text-base font-semibold text-white shadow-lg shadow-primary/35 transition-all hover:brightness-110"
                    disabled={isSubmitting || isAuthenticating}
                  >
                    <span className="inline-flex items-center gap-2">
                      {isSubmitting ? "Signing In..." : "Sign In"}
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </Button>

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
                    <p className="text-xs text-destructive">{errors.captcha}</p>
                  ) : null}
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-0">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-username" className="text-sm font-medium">
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
                        className="h-12 rounded-xl border-white/15 bg-background/80 pl-10 pr-3 text-sm"
                        autoComplete="name"
                      />
                    </div>
                    {displayErrors.username && (
                      <p className="text-xs text-destructive">
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
                    <Label htmlFor="signup-email" className="text-sm font-medium">
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
                        className="h-12 rounded-xl border-white/15 bg-background/80 pl-10 pr-3 text-sm"
                        autoComplete="email"
                      />
                    </div>
                    {displayErrors.email && (
                      <p className="text-xs text-destructive">{displayErrors.email}</p>
                    )}
                    {!displayErrors.email &&
                    activeTab === "signup" &&
                    isCheckingSignupAvailability &&
                    debouncedSignupEmail ? (
                      <p className="text-xs text-muted-foreground">Checking email...</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-sm font-medium">
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
                        className="h-12 rounded-xl border-white/15 bg-background/80 pl-10 pr-10 text-sm"
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
                      <p className="text-xs text-destructive">
                        {errors.password}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="auth-submit-btn mt-1 h-12 w-full rounded-xl bg-gradient-to-r from-primary via-red-500 to-orange-500 text-base font-semibold text-white shadow-lg shadow-primary/35 transition-all hover:brightness-110"
                    disabled={
                      isSubmitting ||
                      isAuthenticating ||
                      Boolean(availabilityErrors.email || availabilityErrors.username)
                    }
                  >
                    <span className="inline-flex items-center gap-2">
                      {isSubmitting ? "Creating Account..." : "Create Account"}
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </Button>

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
                    <p className="text-xs text-destructive">{errors.captcha}</p>
                  ) : null}
                </form>
              </TabsContent>
            </Tabs>
          </section>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Discover movies from Bollywood, Hollywood & more
          </p>
        </div>
      </div>
    </div>
  );
}
