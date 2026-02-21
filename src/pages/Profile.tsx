import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserData } from "@/hooks/useUserData";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import { AppPageSkeleton } from "@/components/AppSkeletons";
import MediaImage from "@/components/MediaImage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getPosterUrl } from "@/lib/tmdb";
import { cn } from "@/lib/utils";
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

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;
const MAX_AVATAR_FILE_SIZE_BYTES = 3 * 1024 * 1024;
const MAX_AVATAR_DATA_URL_LENGTH = 2_500_000;
const DATA_IMAGE_REGEX =
  /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;

const DEFAULT_AVATAR_OPTIONS = [
  {
    id: "net-red",
    label: "Red Hero",
    url: "https://api.dicebear.com/9.x/fun-emoji/svg?seed=RedHero&backgroundColor=ef4444",
  },
  {
    id: "shadow",
    label: "Shadow",
    url: "https://api.dicebear.com/9.x/fun-emoji/svg?seed=Shadow&backgroundColor=111827",
  },
  {
    id: "ember",
    label: "Ember",
    url: "https://api.dicebear.com/9.x/fun-emoji/svg?seed=Ember&backgroundColor=f97316",
  },
  {
    id: "sky",
    label: "Sky",
    url: "https://api.dicebear.com/9.x/fun-emoji/svg?seed=Sky&backgroundColor=3b82f6",
  },
  {
    id: "mint",
    label: "Mint",
    url: "https://api.dicebear.com/9.x/fun-emoji/svg?seed=Mint&backgroundColor=10b981",
  },
  {
    id: "violet",
    label: "Violet",
    url: "https://api.dicebear.com/9.x/fun-emoji/svg?seed=Violet&backgroundColor=8b5cf6",
  },
];

const formatDateLabel = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const isValidHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const isSupportedAvatarValue = (value: string) => {
  if (!value.trim()) return true;

  if (value.startsWith("data:image/")) {
    return value.length <= MAX_AVATAR_DATA_URL_LENGTH && DATA_IMAGE_REGEX.test(value);
  }

  return isValidHttpUrl(value);
};

const getInitials = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
};

type ActivityItem = {
  content_id: number;
  content_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  subtitle: string;
};

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
        className="h-16 w-11 overflow-hidden rounded-md border border-border/60 shrink-0"
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
            className="text-left text-sm font-medium line-clamp-1 hover:text-primary transition-colors"
          >
            {item.title}
          </button>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            {item.content_type === "movie" ? "Movie" : "TV"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{item.subtitle}</p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Button type="button" variant="ghost" size="sm" onClick={onOpen} className="h-8 px-2">
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Button>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-8 px-2 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </li>
  );
});

export default function Profile() {
  const { user, profile, isLoading: authLoading, signOut, updateProfile } = useAuth();
  const {
    watchHistory,
    likedItems,
    isLoading: dataLoading,
    removeFromWatchHistory,
    clearHistory,
  } = useUserData();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [editOpen, setEditOpen] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [avatarInput, setAvatarInput] = useState("");
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    setUsernameInput(profile?.username || user?.username || "");
    setAvatarInput(profile?.avatar_url || "");
  }, [profile?.username, profile?.avatar_url, user?.username]);

  const displayName = profile?.username || user?.username || "User";
  const avatarUrl = profile?.avatar_url || null;
  const isUploadedAvatar = avatarInput.trim().startsWith("data:image/");

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "today";

  const stats = useMemo(() => {
    const movies = watchHistory.filter((w) => w.content_type === "movie").length;
    const tvShows = watchHistory.filter((w) => w.content_type === "tv").length;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const activeThisWeek = watchHistory.filter(
      (item) => new Date(item.watched_at).getTime() >= sevenDaysAgo,
    ).length;
    return { movies, tvShows, activeThisWeek, likes: likedItems.length };
  }, [watchHistory, likedItems]);

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

  const handleSaveProfile = async () => {
    const username = usernameInput.trim();
    const avatar = avatarInput.trim();

    if (!USERNAME_REGEX.test(username)) {
      toast({
        variant: "destructive",
        title: "Invalid username",
        description:
          "Username must be 3-24 characters and only include letters, numbers, or underscores.",
      });
      return;
    }

    if (avatar && !isSupportedAvatarValue(avatar)) {
      toast({
        variant: "destructive",
        title: "Invalid avatar",
        description:
          "Avatar must be a valid http(s) URL or an uploaded PNG/JPG/WebP/GIF image.",
      });
      return;
    }

    setIsSavingProfile(true);
    await updateProfile({
      username,
      avatar_url: avatar ? avatar : null,
    });
    setIsSavingProfile(false);
    setEditOpen(false);
  };

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        variant: "destructive",
        title: "Unsupported file",
        description: "Please upload an image file.",
      });
      return;
    }

    if (file.size > MAX_AVATAR_FILE_SIZE_BYTES) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: "Avatar image must be 3MB or less.",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result.startsWith("data:image/")) {
        toast({
          variant: "destructive",
          title: "Upload failed",
          description: "Could not read this image. Try a different file.",
        });
        return;
      }
      setAvatarInput(result);
    };
    reader.onerror = () => {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: "Could not process this image file.",
      });
    };
    reader.readAsDataURL(file);
  };

  if (authLoading || dataLoading) {
    return <AppPageSkeleton cardCount={16} showFilterRow={false} />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20 md:pb-0">
      <Header />

      <main className="flex-1 pt-20 pb-12">
        <div className="container mx-auto px-4 space-y-7">
          <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-card via-card to-primary/10 p-5 md:p-7">
            <div className="absolute -top-20 -right-16 h-52 w-52 rounded-full bg-primary/20 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-52 w-52 rounded-full bg-secondary/20 blur-3xl" />

            <div className="relative flex flex-col gap-6">
              <div className="flex flex-col lg:flex-row lg:items-center gap-5 lg:justify-between">
                <div className="flex items-start gap-4 md:gap-5">
                  <Avatar className="h-20 w-20 md:h-24 md:w-24 border-4 border-background shadow-xl">
                    <AvatarImage src={avatarUrl || undefined} alt={`${displayName} avatar`} />
                    <AvatarFallback className="text-xl font-bold bg-gradient-to-br from-primary to-secondary text-primary-foreground">
                      {getInitials(displayName)}
                    </AvatarFallback>
                  </Avatar>

                  <div>
                    <Badge variant="secondary" className="mb-2 bg-primary/15 text-primary">
                      <UserRound className="h-3.5 w-3.5 mr-1" />
                      Profile
                    </Badge>
                    <h1 className="text-3xl md:text-4xl font-bold leading-tight">{displayName}</h1>
                    <p className="text-muted-foreground mt-1 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Member since {memberSince}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="gap-2"
                    onClick={() => setEditOpen(true)}
                  >
                    <Camera className="w-4 h-4" />
                    Edit Profile
                  </Button>
                  <Button type="button" variant="outline" onClick={handleSignOut} className="gap-2">
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="bg-background/55 border-border/50">
                  <CardContent className="p-4">
                    <p className="text-xl font-bold">{stats.movies}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      <Film className="w-3.5 h-3.5" />
                      Movies Watched
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-background/55 border-border/50">
                  <CardContent className="p-4">
                    <p className="text-xl font-bold">{stats.tvShows}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      <Tv className="w-3.5 h-3.5" />
                      Series Watched
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-background/55 border-border/50">
                  <CardContent className="p-4">
                    <p className="text-xl font-bold">{stats.activeThisWeek}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Active Last 7 Days
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-background/55 border-border/50">
                  <CardContent className="p-4">
                    <p className="text-xl font-bold">{stats.likes}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      <Heart className="w-3.5 h-3.5" />
                      Liked Titles
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card className="bg-card/70 border-border/60">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Watch History
                </CardTitle>
                {watchHistory.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearHistory}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear Activity
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {activityHistory.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-muted-foreground mb-4">No watch history yet.</p>
                    <Button onClick={() => navigate("/upcoming")}>Start Exploring</Button>
                  </div>
                ) : (
                  <>
                    <ul className="divide-y divide-border/60">
                      {activityHistory.slice(0, 18).map((item) => (
                        <ActivityListItem
                          key={`${item.content_type}-${item.content_id}`}
                          item={item}
                          onOpen={() => handleItemClick(item.content_id, item.content_type)}
                          onRemove={() =>
                            removeFromWatchHistory(item.content_id, item.content_type)
                          }
                        />
                      ))}
                    </ul>
                    {activityHistory.length > 18 && (
                      <p className="text-xs text-muted-foreground pt-3">
                        Showing latest 18 entries.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="bg-card/70 border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Heart className="w-5 h-5 text-primary" />
                  Liked Content
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activityLikes.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-muted-foreground mb-4">No liked content yet.</p>
                    <Button onClick={() => navigate("/upcoming")}>Find Something to Like</Button>
                  </div>
                ) : (
                  <>
                    <ul className="divide-y divide-border/60">
                      {activityLikes.slice(0, 18).map((item) => (
                        <ActivityListItem
                          key={`${item.content_type}-${item.content_id}`}
                          item={item}
                          onOpen={() => handleItemClick(item.content_id, item.content_type)}
                        />
                      ))}
                    </ul>
                    {activityLikes.length > 18 && (
                      <p className="text-xs text-muted-foreground pt-3">
                        Showing latest 18 likes.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      </main>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>
              Update your username, upload your own image, or choose a default avatar pack.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 border border-border">
                <AvatarImage
                  src={avatarInput.trim() ? avatarInput.trim() : avatarUrl || undefined}
                  alt="Profile preview"
                />
                <AvatarFallback className="text-sm font-semibold">
                  {getInitials(usernameInput || displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="text-sm text-muted-foreground">
                Upload your image or select a default avatar.
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-username">Username</Label>
              <Input
                id="profile-username"
                value={usernameInput}
                onChange={(event) => setUsernameInput(event.target.value)}
                placeholder="Your username"
                maxLength={24}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-avatar-url">Avatar URL</Label>
              <Input
                id="profile-avatar-url"
                value={isUploadedAvatar ? "" : avatarInput}
                onChange={(event) => setAvatarInput(event.target.value)}
                placeholder={
                  isUploadedAvatar
                    ? "Uploaded image selected (clear to use URL)"
                    : "https://example.com/avatar.jpg"
                }
              />
              {isUploadedAvatar && (
                <p className="text-xs text-muted-foreground">
                  Uploaded image is currently selected.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Upload Your Image</Label>
              <input
                ref={avatarFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleAvatarUpload}
                className="hidden"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => avatarFileInputRef.current?.click()}
                >
                  Upload Image
                </Button>
                {isUploadedAvatar && (
                  <Button type="button" variant="outline" onClick={() => setAvatarInput("")}>
                    Remove Upload
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                PNG, JPG, WebP or GIF. Max size: 3MB.
              </p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-2">Default Avatar Pack</p>
              <div className="flex flex-wrap gap-2.5">
                {DEFAULT_AVATAR_OPTIONS.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setAvatarInput(candidate.url)}
                    className={cn(
                      "rounded-full border border-border p-1.5 hover:border-primary transition-colors",
                      avatarInput === candidate.url && "border-primary ring-2 ring-primary/30",
                    )}
                    title={candidate.label}
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={candidate.url} alt={candidate.label} />
                      <AvatarFallback>AV</AvatarFallback>
                    </Avatar>
                  </button>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAvatarInput("")}
                  className="h-11"
                >
                  Use Initials
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveProfile} disabled={isSavingProfile}>
              {isSavingProfile ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
      <BottomNav />
    </div>
  );
}
