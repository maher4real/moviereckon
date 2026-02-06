import { useEffect, useMemo, memo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserData } from "@/hooks/useUserData";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import MediaImage from "@/components/MediaImage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPosterUrl } from "@/lib/tmdb";
import {
  User,
  Clock,
  Heart,
  Trash2,
  LogOut,
  Film,
  Tv,
  Calendar,
} from "lucide-react";

// Memoized history card
const HistoryCard = memo(({ item, onRemove, onClick }: { 
  item: { content_id: number; content_type: "movie" | "tv"; title: string; poster_path: string | null };
  onRemove?: () => void;
  onClick: () => void;
}) => (
  <div className="relative group cursor-pointer" onClick={onClick}>
    <div className="aspect-[2/3] rounded-lg overflow-hidden poster-card">
      <MediaImage
        src={getPosterUrl(item.poster_path, "small")}
        alt={item.title}
        className="w-full h-full object-cover"
        loading="lazy"
        fallbackSrc="/fallbacks/poster.svg"
      />
      <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
        {onRemove && (
          <Button
            variant="destructive"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>
      <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-background/80 text-[10px] font-semibold">
        {item.content_type === "movie" ? "Movie" : "TV"}
      </div>
    </div>
    <p className="mt-1 text-xs line-clamp-1 group-hover:text-primary transition-colors">{item.title}</p>
  </div>
));

HistoryCard.displayName = "HistoryCard";

export default function Profile() {
  const { user, profile, isLoading: authLoading, signOut } = useAuth();
  const { watchHistory, likedItems, isLoading: dataLoading, removeFromWatchHistory, clearHistory } = useUserData();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect if no user
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const handleItemClick = (id: number, type: "movie" | "tv") => {
    const fromPath = `${location.pathname}${location.search}${location.hash}`;
    navigate(`/${type}/${id}`, { state: { from: fromPath } });
  };

  // Calculate stats
  const stats = useMemo(() => {
    const movies = watchHistory.filter((w) => w.content_type === "movie").length;
    const tvShows = watchHistory.filter((w) => w.content_type === "tv").length;
    const bollywood = watchHistory.filter((w) => w.language === "hi").length;
    return { movies, tvShows, bollywood, likes: likedItems.length, total: watchHistory.length };
  }, [watchHistory, likedItems]);

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "today";

  if (authLoading || dataLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20 md:pb-0">
      <Header />

      <main className="flex-1 pt-20 pb-12">
        <div className="container mx-auto px-4">
          {/* Profile Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6 mb-8">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-4xl font-bold text-primary-foreground">
              {profile?.username?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">Hello, {profile?.username || "User"}! 👋</h1>
              <p className="text-muted-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Member since {memberSince}
              </p>
            </div>
            <Button variant="outline" onClick={handleSignOut} className="gap-2">
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card className="bg-card/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <Film className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.movies}</p>
                    <p className="text-sm text-muted-foreground">Movies</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-secondary/20 flex items-center justify-center">
                    <Tv className="w-6 h-6 text-secondary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.tvShows}</p>
                    <p className="text-sm text-muted-foreground">TV Shows</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center">
                    <Film className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.bollywood}</p>
                    <p className="text-sm text-muted-foreground">Bollywood</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <Heart className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.likes}</p>
                    <p className="text-sm text-muted-foreground">Liked</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Watch History */}
          <Card className="bg-card/50 mb-8">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Watch History
              </CardTitle>
              {watchHistory.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearHistory} className="text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear All
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {watchHistory.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground mb-4">No watch history yet</p>
                  <Button onClick={() => navigate("/browse")} className="bg-primary hover:bg-primary/90">
                    Start Exploring
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                  {watchHistory.slice(0, 16).map((item) => (
                    <HistoryCard
                      key={`${item.content_id}-${item.content_type}`}
                      item={item}
                      onRemove={() => removeFromWatchHistory(item.content_id, item.content_type)}
                      onClick={() => handleItemClick(item.content_id, item.content_type)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Liked Items */}
          <Card className="bg-card/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-primary" />
                Liked Content
              </CardTitle>
            </CardHeader>
            <CardContent>
              {likedItems.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground mb-4">No liked content yet</p>
                  <Button onClick={() => navigate("/browse")} className="bg-primary hover:bg-primary/90">
                    Find Something to Like
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                  {likedItems.slice(0, 16).map((item) => (
                    <HistoryCard
                      key={`${item.content_id}-${item.content_type}`}
                      item={item}
                      onClick={() => handleItemClick(item.content_id, item.content_type)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}
