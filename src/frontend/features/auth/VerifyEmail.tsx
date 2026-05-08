import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CircleAlert, CircleCheckBig, LoaderCircle } from "lucide-react";
import AuthScreenShell from "@/frontend/components/AuthScreenShell";
import { Alert, AlertDescription, AlertTitle } from "@/frontend/components/ui/alert";
import { Button } from "@/frontend/components/ui/button";
import * as mongoClient from "@/frontend/lib/mongodbClient";

type VerificationState = "loading" | "success" | "error";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [state, setState] = useState<VerificationState>("loading");
  const [message, setMessage] = useState("Verifying your email address...");

  const email = useMemo(() => params.get("email")?.trim() || "", [params]);
  const token = useMemo(() => params.get("token")?.trim() || "", [params]);

  useEffect(() => {
    let cancelled = false;

    if (!email || !token) {
      setState("error");
      setMessage("This verification link is incomplete or invalid.");
      return () => undefined;
    }

    void (async () => {
      const result = await mongoClient.verifyEmail(email, token);
      if (cancelled) return;

      if (result.error) {
        setState("error");
        setMessage(result.error);
        return;
      }

      setState("success");
      setMessage(result.message || "Email verified successfully.");
    })();

    return () => {
      cancelled = true;
    };
  }, [email, token]);

  return (
    <AuthScreenShell
      title="Verify your email"
      description="We’re confirming your email link and activating your MovieReckon account."
    >
      <div className="space-y-5">
        {state === "loading" ? (
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-background/60 px-4 py-4 text-sm text-muted-foreground">
            <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
            {message}
          </div>
        ) : state === "success" ? (
          <Alert className="rounded-2xl border-emerald-500/35 bg-emerald-500/10 text-emerald-100 [&>svg]:text-emerald-300">
            <CircleCheckBig className="h-4 w-4" />
            <AlertTitle>Email verified</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive" className="rounded-2xl border-destructive/40 bg-destructive/10">
            <CircleAlert className="h-4 w-4" />
            <AlertTitle>Verification failed</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            className="auth-submit-btn brand-primary-button h-11 flex-1 rounded-xl font-semibold hover:brightness-110"
            onClick={() => navigate("/auth?email_verified=1")}
          >
            Go to sign in
          </Button>
          {state === "error" ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 rounded-xl border-white/15 bg-background/70 hover:bg-background"
              onClick={() => navigate("/forgot-password")}
            >
              Need a new link?
            </Button>
          ) : null}
        </div>
      </div>
    </AuthScreenShell>
  );
}
