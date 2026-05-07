import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import BrandLogo from "@/frontend/components/BrandLogo";
import { cn } from "@/shared/lib/utils";

type AuthScreenShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
};

export default function AuthScreenShell({
  title,
  description,
  children,
  backHref = "/auth",
  backLabel = "Back to sign in",
  className,
}: AuthScreenShellProps) {
  return (
    <div className="app-page relative min-h-screen overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,hsl(var(--primary)/0.16),transparent_32%),linear-gradient(225deg,hsl(var(--secondary)/0.14),transparent_34%)]" />
        <div className="absolute inset-0 bg-linear-to-br from-background via-background/95 to-background/90" />
        <div className="absolute inset-0 opacity-35 [background-image:repeating-linear-gradient(90deg,transparent_0,transparent_46px,hsl(var(--foreground)/0.04)_47px,hsl(var(--foreground)/0.04)_48px)]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-lg items-center justify-center">
        <section
          className={cn(
            "surface-panel w-full p-7 sm:p-9",
            className,
          )}
        >
          <div className="mb-6 flex items-center justify-between gap-4">
            <Link
              to={backHref}
              className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Link>
            <BrandLogo size="md" />
          </div>

          <header className="mb-6 space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {title}
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          </header>

          {children}
        </section>
      </div>
    </div>
  );
}
