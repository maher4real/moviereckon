import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
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

export default function Profile() {
  const {
    user,
    isLoading: userLoading,
    switchUser,
    clearHistory,
    getRecentlyWatched,
  } = useUser();
  const navigate = useNavigate();

  // Redirect if no user
  useEffect(() => {
    if (!userLoading && !user) {
      navigate("/");
    }
  }, [user, userLoading, navigate]);

  if (userLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const recentlyWatched = getRecentlyWatched(20);
  const totalWatched = user.watchHistory.length;
  const totalLiked = user.likedItems.length;
  const memberSince = new Date(user.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const handleItemClick = (id: number, type: "movie" | "tv") => {
    navigate(`/${type}/${id}`);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20 md:pb-0">
      <Header />

      <main className="flex-1 pt-20 pb-12">
        <div className="container mx-auto px-4">
          {/* Profile Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6 mb-8">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-4xl font-bold text-primary-foreground">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">Hello, {user.username}! 👋</h1>
              <p className="text-muted-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Member since {memberSince}
              </p>
            </div>
            <Button variant="outline" onClick={switchUser}>
              <LogOut className="w-4 h-4 mr-2" />
              Switch User
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
                    <p className="text-2xl font-bold">{totalWatched}</p>
                    <p className="text-sm text-muted-foreground">Watched</p>
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
                    <p className="text-2xl font-bold">{totalLiked}</p>
                    <p className="text-sm text-muted-foreground">Liked</p>
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
                    <p className="text-2xl font-bold">
                      {user.watchHistory.filter((w) => w.language === "hi").length}
                    </p>
                    <p className="text-sm text-muted-foreground">Bollywood</p>
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
                    <p className="text-2xl font-bold">
                      {user.watchHistory.filter((w) => w.type === "tv").length}
                    </p>
                    <p className="text-sm text-muted-foreground">TV Shows</p>
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
              {recentlyWatched.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearHistory}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear History
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {recentlyWatched.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground mb-4">No watch history yet</p>
                  <Button onClick={() => navigate("/browse")}>Start Exploring</Button>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                  {recentlyWatched.map((item) => (
                    <div
                      key={`${item.type}-${item.id}`}
                      onClick={() => handleItemClick(item.id, item.type)}
                      className="cursor-pointer group"
                    >
                      <div className="relative aspect-[2/3] rounded-lg overflow-hidden poster-card">
                        <img
                          src={getPosterUrl(item.posterPath, "medium")}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-xl">▶</span>
                        </div>
                        <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-background/80 text-[10px] font-semibold">
                          {item.type === "movie" ? "Movie" : "TV"}
                        </div>
                      </div>
                      <p className="mt-1 text-xs line-clamp-1 group-hover:text-primary transition-colors">
                        {item.title}
                      </p>
                    </div>
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
              {user.likedItems.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground mb-4">No liked content yet</p>
                  <Button onClick={() => navigate("/browse")}>Find Something to Like</Button>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                  {user.likedItems.map((item) => (
                    <div
                      key={`${item.type}-${item.id}`}
                      onClick={() => handleItemClick(item.id, item.type)}
                      className="cursor-pointer group"
                    >
                      <div className="relative aspect-[2/3] rounded-lg overflow-hidden poster-card">
                        <img
                          src={getPosterUrl(item.posterPath, "medium")}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-xl">▶</span>
                        </div>
                        <div className="absolute top-1 right-1">
                          <Heart className="w-4 h-4 fill-primary text-primary" />
                        </div>
                      </div>
                      <p className="mt-1 text-xs line-clamp-1 group-hover:text-primary transition-colors">
                        {item.title}
                      </p>
                    </div>
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
