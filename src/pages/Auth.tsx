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
import { Film, Mail, Lock, User, Eye, EyeOff } from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { queueStartupSound } from "@/lib/startupSound";

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
  const { user, isLoading, signUp, signIn } = useAuth();
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
    if (!isLoading && user) {
      navigate("/home");
    }
  }, [user, isLoading, navigate]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      newErrors.email = emailResult.error.errors[0].message;
    }

    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      newErrors.password = passwordResult.error.errors[0].message;
    }

    if (activeTab === "signup") {
      const usernameResult = usernameSchema.safeParse(username);
      if (!usernameResult.success) {
        newErrors.username = usernameResult.error.errors[0].message;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      if (activeTab === "signup") {
        const { error } = await signUp(email, password, username);
        if (!error) {
          queueStartupSound();
          navigate("/home");
        }
      } else {
        const { error } = await signIn(email, password);
        if (!error) {
          queueStartupSound();
          navigate("/home");
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <AuthPageSkeleton />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background poster carousel + gradient effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 scale-110 -rotate-2">
          <div className="flex h-full flex-col justify-center gap-3 opacity-40">
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
        <div className="absolute inset-0 bg-gradient-to-br from-background/90 via-background/74 to-background/94" />
        <div className="absolute top-1/4 -left-1/4 w-1/2 h-1/2 bg-primary/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-secondary/15 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Film className="w-10 h-10 text-primary" />
            <h1 className="text-4xl font-bold text-gradient">MovieReckon</h1>
          </div>
          <p className="text-muted-foreground text-center">
            Your personalized gateway to Bollywood & Hollywood
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-card/80 backdrop-blur-md rounded-2xl p-8 border border-border shadow-2xl">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "signin" | "signup")}
          >
            <TabsList className="grid w-full grid-cols-2 mb-6 bg-muted">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 h-12 bg-background"
                      autoComplete="email"
                    />
                  </div>
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="signin-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10 h-12 bg-background"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
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
                  className="w-full h-12 text-lg font-semibold bg-primary hover:bg-primary/90"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <AuthSubmitSkeleton srLabel="Signing in" widthClass="w-20" />
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-username">Username</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="signup-username"
                      type="text"
                      placeholder="Your name"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="pl-10 h-12 bg-background"
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
                  <Label htmlFor="signup-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 h-12 bg-background"
                      autoComplete="email"
                    />
                  </div>
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="At least 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10 h-12 bg-background"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
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
                  className="w-full h-12 text-lg font-semibold bg-primary hover:bg-primary/90"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <AuthSubmitSkeleton srLabel="Creating account" widthClass="w-28" />
                  ) : (
                    "Create Account"
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <p className="text-center text-muted-foreground text-sm mt-6">
          Discover movies from Bollywood, Hollywood & more 🎬
        </p>
      </div>
    </div>
  );
}
