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
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.18),transparent_34%),radial-gradient(circle_at_bottom_right,hsl(var(--secondary)/0.16),transparent_30%)]" />
        <div className="absolute inset-0 bg-linear-to-br from-background via-background/94 to-background/88" />
        <div className="absolute top-[-12rem] left-[-10rem] h-[26rem] w-[26rem] rounded-full bg-primary/12 blur-[110px]" />
        <div className="absolute right-[-10rem] bottom-[-12rem] h-[28rem] w-[28rem] rounded-full bg-secondary/14 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-lg items-center justify-center">
        <section
          className={cn(
            "w-full rounded-[28px] border border-white/10 bg-card/82 p-7 shadow-2xl backdrop-blur-md sm:p-9",
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
