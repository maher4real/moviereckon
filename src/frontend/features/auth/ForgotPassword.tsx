import { useState } from "react";
import { CircleAlert, CircleCheckBig, LoaderCircle, Mail } from "lucide-react";
import AuthScreenShell from "@/frontend/components/AuthScreenShell";
import TurnstileCaptcha from "@/frontend/components/TurnstileCaptcha";
import { Alert, AlertDescription, AlertTitle } from "@/frontend/components/ui/alert";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import * as mongoClient from "@/frontend/lib/mongodbClient";
import { emailSchema } from "@/shared/lib/authValidation";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetNonce, setCaptchaResetNonce] = useState(0);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const captchaSiteKey = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const normalizedEmail = email.trim();
    const emailResult = emailSchema.safeParse(normalizedEmail);
    if (!emailResult.success) {
      setError(emailResult.error.issues[0]?.message || "Please enter a valid email address");
      return;
    }

    if (!captchaSiteKey) {
      setError("CAPTCHA is unavailable. Please contact support.");
      return;
    }

    if (!captchaToken) {
      setError("Please complete CAPTCHA verification.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccessMessage("");

    try {
      const result = await mongoClient.requestPasswordReset(normalizedEmail, captchaToken);
      setCaptchaToken("");
      setCaptchaResetNonce((prev) => prev + 1);

      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccessMessage(
        result.message || "If an account exists for that email, we sent password reset instructions.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthScreenShell
      title="Forgot your password?"
      description="Enter your account email and we’ll send you a secure reset link."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {successMessage ? (
          <Alert className="rounded-2xl border-emerald-500/35 bg-emerald-500/10 text-emerald-100 [&>svg]:text-emerald-300">
            <CircleCheckBig className="h-4 w-4" />
            <AlertTitle>Check your inbox</AlertTitle>
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive" className="rounded-2xl border-destructive/40 bg-destructive/10">
            <CircleAlert className="h-4 w-4" />
            <AlertTitle>Unable to continue</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="forgot-email" className="text-sm font-medium">
            Email address
          </Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="forgot-email"
              type="email"
              value={email}
              placeholder="you@example.com"
              onChange={(event) => {
                setEmail(event.target.value);
                if (error) setError("");
              }}
              className="h-12 rounded-xl border-white/15 bg-background/80 pl-10"
              autoComplete="email"
            />
          </div>
        </div>

        <TurnstileCaptcha
          siteKey={captchaSiteKey}
          action="forgot-password"
          onTokenChange={(token) => {
            setCaptchaToken(token);
            if (error) setError("");
          }}
          resetNonce={captchaResetNonce}
        />

        <Button
          type="submit"
          className="auth-submit-btn h-12 w-full rounded-xl bg-gradient-to-r from-primary via-red-500 to-orange-500 text-white hover:brightness-110"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Sending reset link...
            </span>
          ) : (
            "Send reset link"
          )}
        </Button>
      </form>
    </AuthScreenShell>
  );
}
