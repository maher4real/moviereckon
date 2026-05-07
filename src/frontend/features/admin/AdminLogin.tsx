import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Eye, EyeOff, Lock, ShieldCheck, Loader2, AlertCircle } from "lucide-react";
import BrandLogo from "@/frontend/components/BrandLogo";
import { cn } from "@/shared/lib/utils";

const ADMIN_TOKEN_KEY = "mr_admin_token";

export function getAdminToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearAdminToken() {
  try {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // storage unavailable — ignore
  }
}

export default function AdminLogin() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already authenticated → go straight to admin panel
  useEffect(() => {
    if (getAdminToken()) navigate("/theater/admin", { replace: true });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Authentication failed");
        return;
      }

      sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      navigate("/theater/admin", { replace: true });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-page flex min-h-screen flex-col items-center justify-center px-4">
      <div className="pointer-events-none fixed inset-0 opacity-35 [background-image:repeating-linear-gradient(90deg,transparent_0,transparent_56px,hsl(var(--foreground)/0.04)_57px,hsl(var(--foreground)/0.04)_58px)]" />

      <div className="relative w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <BrandLogo size="md" />
          <div className="flex items-center gap-2 mt-1">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-muted-foreground tracking-widest uppercase">
              Admin Access
            </span>
          </div>
        </div>

        {/* Card */}
        <div className="surface-panel space-y-6 p-8">
          <div className="space-y-1 text-center">
            <h1 className="text-xl font-semibold">Secure Admin Login</h1>
            <p className="text-sm text-muted-foreground">
              Enter the admin password to continue
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="Admin password"
                className={cn(
                  "pl-10 pr-10",
                  error && "border-destructive focus-visible:ring-destructive"
                )}
                autoComplete="current-password"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading || !password.trim()}
              className="w-full btn-primary gap-2"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              {isLoading ? "Verifying..." : "Enter Admin Panel"}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground/50">
          Session expires after 8 hours
        </p>
      </div>
    </div>
  );
}
