import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CircleAlert,
  CircleCheckBig,
  Eye,
  EyeOff,
  LoaderCircle,
  Lock,
} from "lucide-react";
import AuthScreenShell from "@/frontend/components/AuthScreenShell";
import { Alert, AlertDescription, AlertTitle } from "@/frontend/components/ui/alert";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import * as mongoClient from "@/frontend/lib/mongodbClient";
import { signupPasswordSchema } from "@/shared/lib/authValidation";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const email = useMemo(() => params.get("email")?.trim() || "", [params]);
  const token = useMemo(() => params.get("token")?.trim() || "", [params]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!email || !token) {
      setError("This password reset link is incomplete or invalid.");
      return;
    }

    const passwordResult = signupPasswordSchema.safeParse(password);
    if (!passwordResult.success) {
      setError(passwordResult.error.issues[0]?.message || "Please enter a stronger password.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccessMessage("");

    try {
      const result = await mongoClient.resetPassword(email, token, password);
      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccessMessage(result.message || "Password reset successfully. You can sign in now.");
      setPassword("");
      setConfirmPassword("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthScreenShell
      title="Reset your password"
      description="Choose a new password for your MovieReckon account. This reset link expires after one hour."
    >
      <div className="space-y-5">
        {!email || !token ? (
          <Alert variant="destructive" className="rounded-2xl border-destructive/40 bg-destructive/10">
            <CircleAlert className="h-4 w-4" />
            <AlertTitle>Invalid reset link</AlertTitle>
            <AlertDescription>This password reset link is incomplete or invalid.</AlertDescription>
          </Alert>
        ) : null}

        {successMessage ? (
          <Alert className="rounded-2xl border-emerald-500/35 bg-emerald-500/10 text-emerald-100 [&>svg]:text-emerald-300">
            <CircleCheckBig className="h-4 w-4" />
            <AlertTitle>Password updated</AlertTitle>
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive" className="rounded-2xl border-destructive/40 bg-destructive/10">
            <CircleAlert className="h-4 w-4" />
            <AlertTitle>Reset failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {!successMessage ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="reset-password" className="text-xs font-semibold tracking-wide text-foreground/75">
                New password
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="reset-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 10 characters"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (error) setError("");
                  }}
                  className="h-12 rounded-xl border-border/50 bg-background/60 pl-10 pr-10 text-sm transition-colors duration-150 focus-visible:border-primary/50 focus-visible:ring-primary/20"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reset-password-confirm" className="text-xs font-semibold tracking-wide text-foreground/75">
                Confirm new password
              </Label>
              <Input
                id="reset-password-confirm"
                type={showPassword ? "text" : "password"}
                placeholder="Re-enter your new password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  if (error) setError("");
                }}
                className="h-12 rounded-xl border-border/50 bg-background/60 text-sm transition-colors duration-150 focus-visible:border-primary/50 focus-visible:ring-primary/20"
                autoComplete="new-password"
              />
            </div>

            <Button
              type="submit"
              className="auth-submit-btn brand-primary-button h-12 w-full rounded-xl text-base font-semibold shadow-lg shadow-primary/35 transition-all hover:brightness-110"
              disabled={isSubmitting || !email || !token}
            >
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Updating password...
                </span>
              ) : (
                "Reset password"
              )}
            </Button>
          </form>
        ) : null}

        <Button
          type="button"
          variant={successMessage ? "default" : "outline"}
          className="h-11 w-full rounded-xl border-white/15 bg-background/70 hover:bg-background"
          onClick={() => navigate("/auth")}
        >
          Back to sign in
        </Button>
      </div>
    </AuthScreenShell>
  );
}
