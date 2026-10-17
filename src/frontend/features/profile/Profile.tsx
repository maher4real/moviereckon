import { memo, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Footer from "@/frontend/components/Footer";
import Header from "@/frontend/components/Header";
import { ProfileSkeleton } from "@/frontend/components/PageSkeletons";
import MediaImage from "@/frontend/components/MediaImage";
import { Avatar, AvatarFallback, AvatarImage } from "@/frontend/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/frontend/components/ui/alert-dialog";
import { Badge } from "@/frontend/components/ui/badge";
import { Button } from "@/frontend/components/ui/button";
import { useAuth } from "@/frontend/hooks/useAuth";
import { useUserData } from "@/frontend/hooks/useUserData";
import { getWatchlistStatus, useWatchlist } from "@/frontend/hooks/useWatchlist";
import * as mongoClient from "@/frontend/lib/mongodbClient";
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
  Bookmark,
  Download,
  ListVideo,
  SlidersHorizontal,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";

const PROFILE_TABS = [
  { id: "overview", label: "Overview", icon: UserRound },
  { id: "watchlist", label: "Watchlist", icon: Bookmark },
  { id: "history", label: "History", icon: Clock },
  { id: "liked", label: "Liked", icon: Heart },
  { id: "settings", label: "Settings", icon: SlidersHorizontal },
] as const;
type ProfileTab = (typeof PROFILE_TABS)[number]["id"];

const STATUS_LABEL = { saved: "Saved", watching: "Watching", completed: "Completed", dropped: "Dropped" } as const;

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
        aria-label={`Open ${item.title}`}
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
            aria-label={`Open ${item.title}`}
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
          aria-label={`Open ${item.title}`}
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
            aria-label={`Remove ${item.title} from history`}
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
  const { items: watchlistItems, openPanel } = useWatchlist();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab: ProfileTab = PROFILE_TABS.some((tab) => tab.id === requestedTab) ? requestedTab as ProfileTab : "overview";
  const selectTab = (tab: ProfileTab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === "overview") next.delete("tab"); else next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };
  const navigate = useNavigate();
  const location = useLocation();
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [privacyError, setPrivacyError] = useState<string | null>(null);

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

  const libraryStats = useMemo(() => {
    const counts = { saved: 0, watching: 0, completed: 0, dropped: 0 };
    watchlistItems.forEach((item) => {
      counts[getWatchlistStatus(item)] += 1;
    });
    return counts;
  }, [watchlistItems]);

  const fromPath = `${location.pathname}${location.search}${location.hash}`;
  const handleItemClick = (id: number, type: "movie" | "tv") => {
    navigate(`/${type}/${id}`, { state: { from: fromPath } });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const handleExport = async () => {
    setPrivacyBusy(true);
    setPrivacyError(null);
    try {
      const data = await mongoClient.exportUserData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `moviereckon-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to export your data.";
      setPrivacyError(message);
    } finally {
      setPrivacyBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    setPrivacyBusy(true);
    setPrivacyError(null);
    try {
      await mongoClient.deleteAccount();
      await signOut().catch(() => undefined);
      setDeleteDialogOpen(false);
      navigate("/");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete your account.";
      setPrivacyError(message);
    } finally {
      setPrivacyBusy(false);
    }
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
    return <ProfileSkeleton />;
  }

  const statCards = [
    { label: "Movies watched", value: stats.movies, icon: Film },
    { label: "Series watched", value: stats.tvShows, icon: Tv },
    { label: "Active last 7 days", value: stats.activeThisWeek, icon: Sparkles },
    { label: "Liked titles", value: stats.likes, icon: Heart },
  ];

  const emptyState = (message: string, cta: string, href: string) => (
    <div className="empty-state">
      <p className="mb-4 text-muted-foreground">{message}</p>
      <Button onClick={() => navigate(href)}>{cta}</Button>
    </div>
  );

  return (
    <div className="app-page pb-20 md:pb-0">
      <Header />

      <main className="flex-1 pb-12">
        <section className="profile-hero">
          <div className="container mx-auto px-4">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="flex items-center gap-4 md:gap-5">
                <Avatar className="size-20 border-4 border-background shadow-xl md:size-24">
                  <AvatarImage key={avatarUrl || "profile-avatar"} src={avatarUrl || undefined} alt={`${displayName} avatar`} />
                  <AvatarFallback className="bg-linear-to-br from-primary to-secondary text-xl font-bold text-primary-foreground">
                    {getInitials(displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="page-kicker">Your profile</p>
                  <h1 className="truncate text-3xl font-black tracking-[-0.03em] md:text-4xl">{displayName}</h1>
                  <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="size-4" aria-hidden="true" />Member since {memberSince}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="brand-primary-button gap-2 rounded-full" onClick={() => navigate("/profile/edit")}>
                  <Camera className="size-4" />Edit profile
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate("/reckon/preferences", { state: { from: "/profile" } })} className="gap-2 rounded-full">
                  <SlidersHorizontal className="size-4" />Taste
                </Button>
              </div>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              {statCards.map((stat) => (
                <div key={stat.label} className="profile-stat">
                  <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><stat.icon className="size-3.5" aria-hidden="true" />{stat.label}</dt>
                  <dd className="mt-1 text-2xl font-black tabular-nums">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <div className="container mx-auto px-4">
          <nav className="detail-section-nav" aria-label="Profile sections">
            <ul className="filter-row" role="tablist">
              {PROFILE_TABS.map((tab) => (
                <li key={tab.id}>
                  <button type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => selectTab(tab.id)}
                    className={cn("detail-section-link gap-2", activeTab === tab.id && "detail-section-link-active")}>
                    <tab.icon className="size-4" aria-hidden="true" />{tab.label}
                    {tab.id === "watchlist" && watchlistItems.length > 0 && <span className="tabular-nums text-muted-foreground">{watchlistItems.length}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {activeTab === "overview" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="surface-panel p-5" aria-labelledby="library-heading">
                <div className="mb-4 flex items-center justify-between">
                  <h2 id="library-heading" className="flex items-center gap-2 text-lg font-bold"><ListVideo className="size-5 text-primary" />Library</h2>
                  <Button variant="ghost" size="sm" onClick={() => selectTab("watchlist")}>View all</Button>
                </div>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Library status counts">
                  {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((status) => (
                    <div key={status} className="rounded-xl bg-muted/40 p-3">
                      <dt className="text-xs text-muted-foreground">{STATUS_LABEL[status]}</dt>
                      <dd className="text-xl font-bold tabular-nums">{libraryStats[status]}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section className="surface-panel p-5" aria-labelledby="recent-heading">
                <div className="mb-2 flex items-center justify-between">
                  <h2 id="recent-heading" className="flex items-center gap-2 text-lg font-bold"><Clock className="size-5 text-primary" />Recently watched</h2>
                  {activityHistory.length > 0 && <Button variant="ghost" size="sm" onClick={() => selectTab("history")}>View all</Button>}
                </div>
                {activityHistory.length === 0 ? (
                  <p className="py-6 text-sm text-muted-foreground">Nothing watched yet. Titles you mark as watched show up here.</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {activityHistory.slice(0, 4).map((item) => (
                      <ActivityListItem key={`${item.content_type}-${item.content_id}`} item={item} onOpen={() => handleItemClick(item.content_id, item.content_type)} />
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {activeTab === "watchlist" && (
            <section aria-label="Watchlist">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">{watchlistItems.length} titles in your library</p>
                {watchlistItems.length > 0 && <Button variant="outline" onClick={openPanel} className="gap-2 rounded-full"><ListVideo className="size-4" />Reorder & manage</Button>}
              </div>
              {watchlistItems.length === 0 ? emptyState("Your watchlist is empty.", "Browse movies", "/movies") : (
                <ul className="content-grid">
                  {watchlistItems.map((item) => (
                    <li key={item.id}>
                      <button type="button" onClick={() => handleItemClick(item.content_id, item.content_type)} className="browse-card group text-left" aria-label={`Open ${item.title}`}>
                        <div className="poster-card relative aspect-2/3 overflow-hidden rounded-xl">
                          <MediaImage src={getPosterUrl(item.poster_path, "medium")} alt={item.title} className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" loading="lazy" fallbackSrc="/fallbacks/poster.svg" />
                          <span className={cn("profile-status-pill", `profile-status-${getWatchlistStatus(item)}`)}>{STATUS_LABEL[getWatchlistStatus(item)]}</span>
                        </div>
                        <h3 className="mt-2.5 line-clamp-2 text-sm font-semibold group-hover:text-primary">{item.title}</h3>
                        <p className="text-xs text-muted-foreground">{item.content_type === "movie" ? "Movie" : "Series"}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {activeTab === "history" && (
            <section className="surface-panel p-5" aria-label="Watch history">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{activityHistory.length} titles watched</p>
                {watchHistory.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearHistory} className="text-destructive hover:text-destructive">
                    <Trash2 className="mr-2 size-4" />Clear history
                  </Button>
                )}
              </div>
              {activityHistory.length === 0 ? emptyState("No watch history yet.", "Start exploring", "/home") : (
                <>
                  <ul className="divide-y divide-border/60">
                    {activityHistory.slice(0, 60).map((item) => (
                      <ActivityListItem key={`${item.content_type}-${item.content_id}`} item={item}
                        onOpen={() => handleItemClick(item.content_id, item.content_type)}
                        onRemove={() => removeFromWatchHistory(item.content_id, item.content_type)} />
                    ))}
                  </ul>
                  {activityHistory.length > 60 && <p className="pt-3 text-xs text-muted-foreground">Showing the latest 60 entries.</p>}
                </>
              )}
            </section>
          )}

          {activeTab === "liked" && (
            <section className="surface-panel p-5" aria-label="Liked titles">
              {activityLikes.length === 0 ? emptyState("No liked titles yet.", "Find something to like", "/reckon") : (
                <ul className="divide-y divide-border/60">
                  {activityLikes.slice(0, 60).map((item) => (
                    <ActivityListItem key={`${item.content_type}-${item.content_id}`} item={item} onOpen={() => handleItemClick(item.content_id, item.content_type)} />
                  ))}
                </ul>
              )}
            </section>
          )}

          {activeTab === "settings" && (
            <div className="grid max-w-3xl gap-4">
              {[
                { title: "Profile details", body: "Change your username, avatar and bio.", action: "Edit profile", icon: Camera, onClick: () => navigate("/profile/edit") },
                { title: "Taste preferences", body: "Languages and genres Reckon uses to build your feed.", action: "Edit taste", icon: SlidersHorizontal, onClick: () => navigate("/reckon/preferences", { state: { from: "/profile?tab=settings" } }) },
                { title: "Your data", body: "Download a copy of your MovieReckon activity as JSON.", action: "Download my data", icon: Download, onClick: () => void handleExport() },
              ].map((row) => (
                <section key={row.title} className="profile-setting">
                  <row.icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold">{row.title}</h2>
                    <p className="text-sm text-muted-foreground">{row.body}</p>
                  </div>
                  <Button variant="outline" onClick={row.onClick} disabled={privacyBusy} className="shrink-0 rounded-full">{row.action}</Button>
                </section>
              ))}
              <section className="profile-setting">
                <LogOut className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1"><h2 className="font-semibold">Sign out</h2><p className="text-sm text-muted-foreground">Sign out of MovieReckon on this device.</p></div>
                <Button variant="outline" onClick={handleSignOut} className="shrink-0 rounded-full">Sign out</Button>
              </section>
              <section className="profile-setting border-destructive/30 bg-destructive/5">
                <ShieldAlert className="size-5 shrink-0 text-destructive" aria-hidden="true" />
                <div className="min-w-0 flex-1"><h2 className="font-semibold">Delete account</h2><p className="text-sm text-muted-foreground">Permanently remove your profile, library, history and recommendation data.</p></div>
                <Button variant="outline" onClick={() => { setPrivacyError(null); setDeleteDialogOpen(true); }} disabled={privacyBusy} className="shrink-0 rounded-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive">Delete account</Button>
              </section>
              {privacyError ? <p role="alert" className="text-sm text-destructive">{privacyError}</p> : null}
            </div>
          )}

          <AlertDialog
            open={deleteDialogOpen}
            onOpenChange={(open) => {
              if (!privacyBusy) setDeleteDialogOpen(open);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account permanently?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes your profile, library, history, preferences, feedback, taste profile, and recommendation data. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {privacyError ? (
                <p role="alert" className="text-sm text-destructive">{privacyError}</p>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={privacyBusy}>Keep my account</AlertDialogCancel>
                <AlertDialogAction
                  disabled={privacyBusy}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={(event) => {
                    event.preventDefault();
                    void handleDeleteAccount();
                  }}
                >
                  {privacyBusy ? "Deleting…" : "Delete permanently"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </main>

      <Footer />
    </div>
  );
}
