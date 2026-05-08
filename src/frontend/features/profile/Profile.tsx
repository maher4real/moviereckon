import { memo, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Footer from "@/frontend/components/Footer";
import Header from "@/frontend/components/Header";
import { AppPageSkeleton } from "@/frontend/components/AppSkeletons";
import MediaImage from "@/frontend/components/MediaImage";
import { Avatar, AvatarFallback, AvatarImage } from "@/frontend/components/ui/avatar";
import { Badge } from "@/frontend/components/ui/badge";
import { Button } from "@/frontend/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { useAuth } from "@/frontend/hooks/useAuth";
import { useUserData } from "@/frontend/hooks/useUserData";
import { getInitials, normalizeAvatarValue } from "@/frontend/lib/profileEditor";
import { getPosterUrl } from "@/shared/lib/tmdb";
import {
  ArrowUpRight,
  Calendar,
  Camera,
  Clock,
  Film,
  Heart,
  LogOut,
  Sparkles,
  Trash2,
  Tv,
  UserRound,
} from "lucide-react";

type ActivityItem = {
  content_id: number;
  content_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  subtitle: string;
};

const formatDateLabel = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const ActivityListItem = memo(function ActivityListItem({
  item,
  onOpen,
  onRemove,
}: {
  item: ActivityItem;
  onOpen: () => void;
  onRemove?: () => void;
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      <button
        type="button"
        onClick={onOpen}
        className="h-16 w-11 shrink-0 overflow-hidden rounded-md border border-border/60"
      >
        <MediaImage
          src={getPosterUrl(item.poster_path, "small")}
          alt={item.title}
          className="h-full w-full object-cover"
          loading="lazy"
          fallbackSrc="/fallbacks/poster.svg"
        />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="line-clamp-1 text-left text-sm font-medium transition-colors hover:text-primary"
          >
            {item.title}
          </button>
          <Badge
            variant="outline"
            className="text-[10px] uppercase tracking-wide"
          >
            {item.content_type === "movie" ? "Movie" : "TV"}
          </Badge>
        </div>
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
          {item.subtitle}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onOpen}
          className="h-8 px-2"
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Button>
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-8 px-2 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    </li>
  );
});

export default function Profile() {
  const {
    user,
    profile,
    signOut,
  } = useAuth();
  const {
    watchHistory,
    likedItems,
    isLoading: dataLoading,
    removeFromWatchHistory,
    clearHistory,
  } = useUserData();
  const navigate = useNavigate();
  const location = useLocation();

  const displayName = profile?.username || user?.username || "User";
  const avatarUrl = normalizeAvatarValue(profile?.avatar_url || "") || null;
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "today";

  const stats = useMemo(() => {
    const movies = watchHistory.filter((item) => item.content_type === "movie").length;
    const tvShows = watchHistory.filter((item) => item.content_type === "tv").length;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const activeThisWeek = watchHistory.filter(
      (item) => new Date(item.watched_at).getTime() >= sevenDaysAgo,
    ).length;

    return { movies, tvShows, activeThisWeek, likes: likedItems.length };
  }, [likedItems, watchHistory]);

  const fromPath = `${location.pathname}${location.search}${location.hash}`;
  const handleItemClick = (id: number, type: "movie" | "tv") => {
    navigate(`/${type}/${id}`, { state: { from: fromPath } });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const activityHistory = useMemo<ActivityItem[]>(
    () =>
      watchHistory.map((item) => ({
        content_id: item.content_id,
        content_type: item.content_type,
        title: item.title,
        poster_path: item.poster_path,
        subtitle: `${item.language?.toUpperCase() || "N/A"} • Watched ${formatDateLabel(item.watched_at)}`,
      })),
    [watchHistory],
  );

  const activityLikes = useMemo<ActivityItem[]>(
    () =>
      likedItems.map((item) => ({
        content_id: item.content_id,
        content_type: item.content_type,
        title: item.title,
        poster_path: item.poster_path,
        subtitle: `Liked on ${formatDateLabel(item.liked_at)}`,
      })),
    [likedItems],
  );

  if (dataLoading) {
    return <AppPageSkeleton cardCount={16} showFilterRow={false} />;
  }

  return (
    <div className="app-page pb-20 md:pb-0">
      <Header />

      <main className="page-main">
        <div className="container mx-auto px-4 space-y-7">
          <section className="surface-panel relative overflow-hidden bg-linear-to-br from-card via-card to-primary/10 p-5 md:p-7">
            <div className="absolute inset-0 opacity-25 [background-image:repeating-linear-gradient(90deg,transparent_0,transparent_62px,hsl(var(--foreground)/0.05)_63px,hsl(var(--foreground)/0.05)_64px)]" />

            <div className="relative flex flex-col gap-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4 md:gap-5">
                  <Avatar className="h-20 w-20 border-4 border-background shadow-xl md:h-24 md:w-24">
                    <AvatarImage
                      key={avatarUrl || "profile-avatar"}
                      src={avatarUrl || undefined}
                      alt={`${displayName} avatar`}
                    />
                    <AvatarFallback className="bg-linear-to-br from-primary to-secondary text-xl font-bold text-primary-foreground">
                      {getInitials(displayName)}
                    </AvatarFallback>
                  </Avatar>

                  <div>
                    <Badge
                      variant="secondary"
                      className="mb-2 bg-primary/15 text-primary"
                    >
                      <UserRound className="mr-1 h-3.5 w-3.5" />
                      Profile
                    </Badge>
                    <h1 className="text-3xl font-bold leading-tight md:text-4xl">
                      {displayName}
                    </h1>
                    <p className="mt-1 flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      Member since {memberSince}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="gap-2 bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
                    onClick={() => navigate("/profile/edit")}
                  >
                    <Camera className="h-4 w-4" />
                    Edit Profile
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSignOut}
                    className="gap-2"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Card className="border-border/50 bg-background/55 shadow-none">
                  <CardContent className="p-4">
                    <p className="text-xl font-bold">{stats.movies}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Film className="h-3.5 w-3.5" />
                      Movies Watched
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-background/55 shadow-none">
                  <CardContent className="p-4">
                    <p className="text-xl font-bold">{stats.tvShows}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Tv className="h-3.5 w-3.5" />
                      Series Watched
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-background/55 shadow-none">
                  <CardContent className="p-4">
                    <p className="text-xl font-bold">{stats.activeThisWeek}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5" />
                      Active Last 7 Days
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-background/55 shadow-none">
                  <CardContent className="p-4">
                    <p className="text-xl font-bold">{stats.likes}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Heart className="h-3.5 w-3.5" />
                      Liked Titles
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card className="surface-panel bg-card/70">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Watch History
                </CardTitle>
                {watchHistory.length > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearHistory}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Clear Activity
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent>
                {activityHistory.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="mb-4 text-muted-foreground">
                      No watch history yet.
                    </p>
                    <Button onClick={() => navigate("/upcoming")}>
                      Start Exploring
                    </Button>
                  </div>
                ) : (
                  <>
                    <ul className="divide-y divide-border/60">
                      {activityHistory.slice(0, 18).map((item) => (
                        <ActivityListItem
                          key={`${item.content_type}-${item.content_id}`}
                          item={item}
                          onOpen={() =>
                            handleItemClick(item.content_id, item.content_type)
                          }
                          onRemove={() =>
                            removeFromWatchHistory(
                              item.content_id,
                              item.content_type,
                            )
                          }
                        />
                      ))}
                    </ul>
                    {activityHistory.length > 18 ? (
                      <p className="pt-3 text-xs text-muted-foreground">
                        Showing latest 18 entries.
                      </p>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="surface-panel bg-card/70">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Heart className="h-5 w-5 text-primary" />
                  Liked Content
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activityLikes.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="mb-4 text-muted-foreground">
                      No liked content yet.
                    </p>
                    <Button onClick={() => navigate("/upcoming")}>
                      Find Something to Like
                    </Button>
                  </div>
                ) : (
                  <>
                    <ul className="divide-y divide-border/60">
                      {activityLikes.slice(0, 18).map((item) => (
                        <ActivityListItem
                          key={`${item.content_type}-${item.content_id}`}
                          item={item}
                          onOpen={() =>
                            handleItemClick(item.content_id, item.content_type)
                          }
                        />
                      ))}
                    </ul>
                    {activityLikes.length > 18 ? (
                      <p className="pt-3 text-xs text-muted-foreground">
                        Showing latest 18 likes.
                      </p>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
