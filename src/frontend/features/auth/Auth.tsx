import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/frontend/hooks/useAuth";
import BrandLogo from "@/frontend/components/BrandLogo";
import TurnstileCaptcha from "@/frontend/components/TurnstileCaptcha";
import { Alert, AlertDescription, AlertTitle } from "@/frontend/components/ui/alert";
import { Button } from "@/frontend/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/frontend/components/ui/tabs";
import {
  ArrowRight,
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
  AuthAmbientBackdrop,
  AuthField,
  AuthShowcasePanel,
  AuthTrendingRail,
  FieldError,
  GoogleFallbackButton,
} from "./AuthParts";
import { useAuthShowcase } from "./useAuthShowcase";
import { useGoogleSignIn } from "./useGoogleSignIn";
import { useSignupAvailability } from "./useSignupAvailability";

type VerificationBannerState = {
  tone: "success" | "error" | "info";
  message: string;
};

const TAB_TRIGGER =
  "rounded-lg text-sm font-semibold tracking-wide transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/35 data-[state=inactive]:text-muted-foreground";
const SUBMIT_BUTTON =
  "auth-submit-btn brand-primary-button relative mt-1 h-12 w-full rounded-xl text-base font-semibold shadow-lg shadow-primary/35 transition-all hover:brightness-110";

function PasswordToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
      aria-label={visible ? "Hide password" : "Show password"}
    >
      {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

function SubmitLabel({ busy, idle, busyText }: { busy: boolean; idle: string; busyText: string }) {
  return (
    <>
      {busy && <span className="auth-btn-loading-fill" aria-hidden="true" />}
      <span className="relative z-10 inline-flex items-center gap-2">
        {busy ? busyText : idle}
        {!busy && <ArrowRight className="h-4 w-4" />}
      </span>
    </>
  );
}

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
  const [signinCaptchaToken, setSigninCaptchaToken] = useState("");
  const [signupCaptchaToken, setSignupCaptchaToken] = useState("");
  const [signinCaptchaResetNonce, setSigninCaptchaResetNonce] = useState(0);
  const [signupCaptchaResetNonce, setSignupCaptchaResetNonce] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [verificationBanner, setVerificationBanner] = useState<VerificationBannerState | null>(null);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const captchaSiteKey = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim();

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const normalizedEmail = email.trim();
  const normalizedUsername = username.trim();

  const { showcaseSlides, ambientArt, setAmbientSlide } = useAuthShowcase();

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

  const {
    googleButtonRef,
    isGoogleIdentityReady,
    isGoogleSubmitting,
    googlePromptError,
    setGooglePromptError,
    handleGoogleSignIn,
  } = useGoogleSignIn({
    activeTab,
    hasUser: Boolean(user),
    isLoading,
    signInWithGoogle,
    signInWithGoogleOneTap,
    triggerAuthTransition,
    onOneTapSignedIn: () => {
      setPendingVerificationEmail("");
      setVerificationBanner(null);
    },
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

  const {
    signupAvailability,
    isCheckingSignupAvailability,
    debouncedSignupEmail,
    debouncedSignupUsername,
    isCurrentEmailAvailability,
    isCurrentUsernameAvailability,
    availabilityErrors,
  } = useSignupAvailability(activeTab, normalizedEmail, normalizedUsername);

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
          // A brand-new account picks its taste before the first feed loads.
          navigate("/welcome");
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

  const canPromptResendVerification =
    activeTab === "signin" && pendingVerificationEmail.length > 0;
  const resendVerificationMessage = verificationBanner?.message
    || (pendingVerificationEmail
      ? `Check ${pendingVerificationEmail} for the verification link, then come back here to sign in.`
      : "Enter your email and password to request another verification email.");
  const resendVerificationHint = "We limit resend requests to one email per minute.";
  const combinedGoogleErrorMessage = googlePromptError || oauthErrorMessage;

  const showCard = !isLoading && !user;
  const googleBusy = isSubmitting || isGoogleSubmitting || isAuthenticating;

  const handleTabChange = (value: string) => {
    setActiveTab(value as "signin" | "signup");
    setErrors({});
    setGooglePromptError("");
    setSigninCaptchaToken("");
    setSignupCaptchaToken("");
    setSigninCaptchaResetNonce((prev) => prev + 1);
    setSignupCaptchaResetNonce((prev) => prev + 1);
  };

  return (
    <div className="app-page relative min-h-screen overflow-hidden">
      <AuthAmbientBackdrop art={ambientArt} />

      <div className={cn(
        "relative z-10 mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center p-4 sm:p-6",
        showCard && "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-12 lg:px-10 xl:gap-20",
      )}>
        {showCard ? <AuthShowcasePanel slides={showcaseSlides} onActiveChange={setAmbientSlide} /> : null}
        {showCard ? (
          <div className="w-full max-w-md animate-fade-in lg:justify-self-end">
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
                <Alert className="mb-5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-emerald-100 [&>svg]:text-emerald-300">
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
                  <GoogleFallbackButton busy={isGoogleSubmitting} disabled={googleBusy} onClick={handleGoogleSignIn} />
                ) : null}
              </div>

              <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                <span className="h-px flex-1 bg-white/15" />
                <span>or continue with email</span>
                <span className="h-px flex-1 bg-white/15" />
              </div>

              <Tabs value={activeTab} onValueChange={handleTabChange}>
                <TabsList className="mb-6 grid h-11 w-full grid-cols-2 rounded-xl border border-white/10 bg-background/60 p-1">
                  <TabsTrigger value="signin" className={TAB_TRIGGER}>Sign In</TabsTrigger>
                  <TabsTrigger value="signup" className={TAB_TRIGGER}>Sign Up</TabsTrigger>
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
                          <span className="text-xs text-primary-foreground/80">{resendVerificationHint}</span>
                        </div>
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <AuthField
                      id="signin-email"
                      label="Email Address"
                      icon={Mail}
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      value={email}
                      error={displayErrors.email}
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
                    />

                    <AuthField
                      id="signin-password"
                      label="Password"
                      icon={Lock}
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      value={password}
                      error={errors.password}
                      trailing={<PasswordToggle visible={showPassword} onToggle={() => setShowPassword(!showPassword)} />}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearError("password");
                      }}
                      footer={
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => navigate("/forgot-password")}
                            className="cursor-pointer text-xs font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:underline"
                          >
                            Forgot password?
                          </button>
                        </div>
                      }
                    />

                    <TurnstileCaptcha
                      siteKey={captchaSiteKey}
                      action="login"
                      onTokenChange={(token) => {
                        setSigninCaptchaToken(token);
                        clearError("captcha");
                      }}
                      resetNonce={signinCaptchaResetNonce}
                    />
                    {errors.captcha && activeTab === "signin" ? <FieldError>{errors.captcha}</FieldError> : null}

                    <Button type="submit" className={SUBMIT_BUTTON} disabled={isSubmitting || isAuthenticating}>
                      <SubmitLabel busy={isSubmitting} idle="Sign In" busyText="Signing In..." />
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="signup" className="mt-0">
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <AuthField
                      id="signup-username"
                      label="Username"
                      icon={User}
                      type="text"
                      placeholder="Pick a username"
                      autoComplete="name"
                      value={username}
                      error={displayErrors.username}
                      hint={activeTab === "signup" && isCheckingSignupAvailability && debouncedSignupUsername ? "Checking username..." : null}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        clearError("username");
                      }}
                    />

                    <AuthField
                      id="signup-email"
                      label="Email Address"
                      icon={Mail}
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      value={email}
                      error={displayErrors.email}
                      hint={activeTab === "signup" && isCheckingSignupAvailability && debouncedSignupEmail ? "Checking email..." : null}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearError("email");
                        setVerificationBanner(null);
                      }}
                    />

                    <AuthField
                      id="signup-password"
                      label="Password"
                      icon={Lock}
                      type={showPassword ? "text" : "password"}
                      placeholder="At least 10 characters"
                      autoComplete="new-password"
                      value={password}
                      error={errors.password}
                      trailing={<PasswordToggle visible={showPassword} onToggle={() => setShowPassword(!showPassword)} />}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearError("password");
                      }}
                    />

                    <TurnstileCaptcha
                      siteKey={captchaSiteKey}
                      action="signup"
                      onTokenChange={(token) => {
                        setSignupCaptchaToken(token);
                        clearError("captcha");
                      }}
                      resetNonce={signupCaptchaResetNonce}
                    />
                    {errors.captcha && activeTab === "signup" ? <FieldError>{errors.captcha}</FieldError> : null}

                    <Button
                      type="submit"
                      className={SUBMIT_BUTTON}
                      disabled={
                        isSubmitting ||
                        isAuthenticating ||
                        Boolean(availabilityErrors.email || availabilityErrors.username)
                      }
                    >
                      <SubmitLabel busy={isSubmitting} idle="Create Account" busyText="Creating Account..." />
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </section>

            <AuthTrendingRail slides={showcaseSlides} />
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
