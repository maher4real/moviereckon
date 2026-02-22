import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  getTrendingMovies,
  getTrendingTVShows,
  getBollywoodMovies,
  getPosterUrl,
} from "@/lib/tmdb";
import { AuthPageSkeleton } from "@/components/AppSkeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import MediaImage from "@/components/MediaImage";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Film,
  Lock,
  Mail,
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
  .min(6, "Password must be at least 6 characters")
  .max(100, "Password is too long");
const usernameSchema = z
  .string()
  .min(2, "Username must be at least 2 characters")
  .max(50, "Username is too long");
function AuthSubmitSkeleton({
  srLabel,
  widthClass,
}: {
  srLabel: string;
  widthClass: string;
}) {
  return (
    <span
      className="flex w-full items-center justify-center gap-2.5"
      aria-live="polite"
      aria-busy="true"
    >
      <span aria-hidden="true" className="h-4 w-4 rounded-full bg-white/50 animate-pulse" />
      <span aria-hidden="true" className={cn("h-3.5 rounded bg-white/40 animate-pulse", widthClass)} />
      <span className="sr-only">{srLabel}</span>
    </span>
  );
}

export default function Auth() {
  const navigate = useNavigate();
  const { user, isLoading, signUp, signIn, triggerAuthTransition } = useAuth();
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");

  const { data: trendingMovies } = useQuery({
    queryKey: ["auth-bg-trending-movies"],
    queryFn: () => getTrendingMovies("week"),
    staleTime: 1000 * 60 * 10,
  });

  const { data: trendingTV } = useQuery({
    queryKey: ["auth-bg-trending-tv"],
    queryFn: () => getTrendingTVShows("week"),
    staleTime: 1000 * 60 * 10,
  });

  const { data: bollywoodData } = useQuery({
    queryKey: ["auth-bg-bollywood"],
    queryFn: () => getBollywoodMovies(1),
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

    return Array.from({ length: 36 }, (_, index) => ({
      id: `fallback-${index}`,
      src: "/fallbacks/poster.svg",
    }));
  }, [bollywoodData, trendingMovies, trendingTV]);

  const posterRows = useMemo(() => {
    if (!backgroundPosters.length) return [];

    const rowCount = 4;
    const postersPerRow = 12;

    return Array.from({ length: rowCount }, (_, rowIndex) => {
      const start = (rowIndex * 6) % backgroundPosters.length;
      return Array.from({ length: postersPerRow }, (_, offset) => {
        return backgroundPosters[(start + offset) % backgroundPosters.length];
      });
    });
  }, [backgroundPosters]);

  // Redirect if already authenticated
  useEffect(() => {
    if (user) {
      navigate("/home", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    warmStartupSound();
  }, []);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      newErrors.email = emailResult.error.issues[0]?.message || "Invalid email";
    }

    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      newErrors.password = passwordResult.error.issues[0]?.message || "Invalid password";
    }

    if (activeTab === "signup") {
      const usernameResult = usernameSchema.safeParse(username);
      if (!usernameResult.success) {
        newErrors.username = usernameResult.error.issues[0]?.message || "Invalid username";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    // Prime audio in direct user gesture path to reduce autoplay delays after navigation.
    void primeStartupSoundFromGesture();

    setIsSubmitting(true);

    try {
      if (activeTab === "signup") {
        const { error } = await signUp(email, password, username);
        if (!error) {
          triggerAuthTransition();
          queueStartupSound();
          navigate("/home");
        }
      } else {
        const { error } = await signIn(email, password);
        if (!error) {
          triggerAuthTransition();
          queueStartupSound();
          navigate("/home");
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (user) {
    return null;
  }

  if (isLoading) {
    return <AuthPageSkeleton />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background p-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 scale-[1.08] -rotate-2">
          <div className="flex h-full flex-col justify-center gap-3 opacity-45">
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
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_22%,hsl(var(--secondary)/0.2),transparent_42%),radial-gradient(circle_at_84%_74%,hsl(var(--primary)/0.24),transparent_45%)]" />
        <div className="absolute inset-0 bg-gradient-to-br from-background/76 via-background/56 to-background/72" />
        <div className="absolute top-1/4 -left-1/4 h-1/2 w-1/2 rounded-full bg-primary/12 blur-[120px]" />
        <div className="absolute bottom-1/4 -right-1/4 h-1/2 w-1/2 rounded-full bg-secondary/12 blur-[120px]" />
      </div>

      <div className="relative z-10 flex min-h-screen w-full items-center justify-center">
        <div className="w-full max-w-md animate-fade-in">
          <div className="mb-8 flex flex-col items-center">
            <div className="mb-4 flex items-center gap-2">
              <Film className="h-10 w-10 text-primary" />
              <h1 className="text-4xl font-bold text-gradient">MovieReckon</h1>
            </div>
            <p className="text-center text-muted-foreground">
              Your personalized gateway to Bollywood & Hollywood
            </p>
          </div>

          <section className="rounded-2xl border border-white/10 bg-card/78 p-8 shadow-2xl backdrop-blur-md">
            <Tabs
              value={activeTab}
              onValueChange={(value) => {
                setActiveTab(value as "signin" | "signup");
                setErrors({});
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
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-12 rounded-xl border-white/15 bg-background/80 pl-10 pr-3 text-sm"
                        autoComplete="email"
                      />
                    </div>
                    {errors.email && (
                      <p className="text-xs text-destructive">{errors.email}</p>
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
                        onChange={(e) => setPassword(e.target.value)}
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
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <AuthSubmitSkeleton srLabel="Signing in" widthClass="w-20" />
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        Sign In
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    )}
                  </Button>
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
                        onChange={(e) => setUsername(e.target.value)}
                        className="h-12 rounded-xl border-white/15 bg-background/80 pl-10 pr-3 text-sm"
                        autoComplete="name"
                      />
                    </div>
                    {errors.username && (
                      <p className="text-xs text-destructive">
                        {errors.username}
                      </p>
                    )}
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
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-12 rounded-xl border-white/15 bg-background/80 pl-10 pr-3 text-sm"
                        autoComplete="email"
                      />
                    </div>
                    {errors.email && (
                      <p className="text-xs text-destructive">{errors.email}</p>
                    )}
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
                        placeholder="At least 6 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
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
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <AuthSubmitSkeleton srLabel="Creating account" widthClass="w-28" />
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        Create Account
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    )}
                  </Button>
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
