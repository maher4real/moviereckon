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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { importAvatarFromUrl } from "@/lib/mongodbClient";
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
const TARGET_AVATAR_DATA_URL_LENGTH = 170_000;
const MAX_AVATAR_DATA_URL_LENGTH = 240_000;
const DATA_IMAGE_REGEX =
  /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;
const LOCAL_AVATAR_PATH_REGEX =
  /^\/avatars\/[a-z0-9-_]+\.(?:svg|png|jpe?g|webp|gif)$/i;
const MAX_AVATAR_DIMENSION = 320;
const MIN_AVATAR_DIMENSION = 128;

const DEFAULT_AVATAR_OPTIONS = [
  {
    id: "aurora",
    label: "Aurora Lead",
    url: "/avatars/cinema-aurora.svg",
  },
  {
    id: "noir",
    label: "Noir Cut",
    url: "/avatars/cinema-noir.svg",
  },
  {
    id: "sunset",
    label: "Sunset Frame",
    url: "/avatars/cinema-sunset.svg",
  },
  {
    id: "forest",
    label: "Forest Reel",
    url: "/avatars/cinema-forest.svg",
  },
  {
    id: "ocean",
    label: "Ocean Cast",
    url: "/avatars/cinema-ocean.svg",
  },
  {
    id: "rose",
    label: "Rose Spotlight",
    url: "/avatars/cinema-rose.svg",
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

const getLocalAvatarPath = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (LOCAL_AVATAR_PATH_REGEX.test(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed);
    return LOCAL_AVATAR_PATH_REGEX.test(parsed.pathname)
      ? parsed.pathname
      : null;
  } catch {
    return null;
  }
};

const normalizeAvatarValue = (value: string) => {
  const trimmed = value.trim();
  return getLocalAvatarPath(trimmed) || trimmed;
};

const isSupportedAvatarValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return true;

  if (trimmed.startsWith("data:image/")) {
    return (
      trimmed.length <= MAX_AVATAR_DATA_URL_LENGTH &&
      DATA_IMAGE_REGEX.test(trimmed)
    );
  }

  if (getLocalAvatarPath(trimmed)) {
    return true;
  }

  return isValidHttpUrl(trimmed);
};

const isRemoteAvatarUrl = (value: string) =>
  Boolean(value.trim()) &&
  !value.trim().startsWith("data:image/") &&
  !getLocalAvatarPath(value) &&
  isValidHttpUrl(value);

const readFileAsDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Invalid file reader result"));
    };
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });

const loadImageFromDataUrl = (dataUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to decode uploaded image"));
    image.src = dataUrl;
  });

const compressAvatarImage = async (file: Blob) => {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImageFromDataUrl(dataUrl);

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.max(
    0,
    Math.floor((image.naturalWidth - sourceSize) / 2),
  );
  const sourceY = Math.max(
    0,
    Math.floor((image.naturalHeight - sourceSize) / 2),
  );
  let targetSize = Math.max(1, Math.min(MAX_AVATAR_DIMENSION, sourceSize));
  const minimumTargetSize = Math.min(targetSize, MIN_AVATAR_DIMENSION);

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is not available for image optimization");
  }

  const drawResizedImage = (size: number) => {
    canvas.width = size;
    canvas.height = size;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.clearRect(0, 0, size, size);
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      size,
      size,
    );
  };

  const findBestEncodedImage = () => {
    let best = canvas.toDataURL("image/webp", 0.82);
    if (best.length <= TARGET_AVATAR_DATA_URL_LENGTH) return best;

    let low = 0.5;
    let high = 0.82;
    let bestUnderTarget = "";

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const quality = (low + high) / 2;
      const candidate = canvas.toDataURL("image/webp", quality);

      if (candidate.length <= TARGET_AVATAR_DATA_URL_LENGTH) {
        bestUnderTarget = candidate;
        low = quality;
      } else {
        high = quality;
      }
    }

    if (bestUnderTarget) return bestUnderTarget;

    best = canvas.toDataURL("image/webp", 0.6);
    if (best.length <= MAX_AVATAR_DATA_URL_LENGTH) return best;

    return best;
  };

  drawResizedImage(targetSize);

  let output = findBestEncodedImage();

  while (
    output.length > MAX_AVATAR_DATA_URL_LENGTH &&
    targetSize > minimumTargetSize
  ) {
    targetSize = Math.max(minimumTargetSize, Math.round(targetSize * 0.88));
    drawResizedImage(targetSize);
    output = findBestEncodedImage();
  }

  if (output.length > MAX_AVATAR_DATA_URL_LENGTH) {
    throw new Error("Unable to compress avatar image within size limits");
  }

  return output;
};

const getInitials = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
};

const isDefaultAvatarSelected = (
  currentValue: string,
  candidatePath: string,
) => getLocalAvatarPath(currentValue) === candidatePath;

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
          <Badge
            variant="outline"
            className="text-[10px] uppercase tracking-wide"
          >
            {item.content_type === "movie" ? "Movie" : "TV"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
          {item.subtitle}
        </p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onOpen}
          className="h-8 px-2"
        >
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
  const {
    user,
    profile,
    isLoading: authLoading,
    signOut,
    updateProfile,
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
  const { toast } = useToast();

  const [editOpen, setEditOpen] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isProcessingAvatar, setIsProcessingAvatar] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [avatarInput, setAvatarInput] = useState("");
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  const displayName = profile?.username || user?.username || "User";
  const avatarUrl = normalizeAvatarValue(profile?.avatar_url || "") || null;
  const normalizedAvatarInput = normalizeAvatarValue(avatarInput);
  const selectedAvatarValue = normalizedAvatarInput || avatarUrl || "";
  const previewAvatar = selectedAvatarValue || undefined;
  const isUploadedAvatar = normalizedAvatarInput.startsWith("data:image/");
  const isDefaultAvatar = Boolean(getLocalAvatarPath(normalizedAvatarInput));
  const isRemoteLinkedAvatar = isRemoteAvatarUrl(normalizedAvatarInput);
  const avatarInputValue =
    isUploadedAvatar || isDefaultAvatar ? "" : normalizedAvatarInput;
  const avatarStatusLabel = isUploadedAvatar
    ? "Uploaded"
    : isRemoteLinkedAvatar
      ? "Link image"
      : isDefaultAvatar
        ? "Default avatar"
        : selectedAvatarValue
          ? "Current avatar"
          : "Initials";

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "today";

  const stats = useMemo(() => {
    const movies = watchHistory.filter(
      (w) => w.content_type === "movie",
    ).length;
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

  const handleEditOpenChange = (open: boolean) => {
    if (open) {
      setUsernameInput(profile?.username || user?.username || "");
      setAvatarInput(normalizeAvatarValue(profile?.avatar_url || ""));
    }
    setEditOpen(open);
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

  const importAvatarFromLink = async (urlValue = avatarInput.trim()) => {
    const normalizedUrlValue = normalizeAvatarValue(urlValue);
    if (!isRemoteAvatarUrl(normalizedUrlValue)) {
      toast({
        variant: "destructive",
        title: "Invalid image link",
        description: "Paste a direct public http(s) image URL to import it.",
      });
      return null;
    }

    try {
      setIsProcessingAvatar(true);
      const remoteBlob = await importAvatarFromUrl(normalizedUrlValue);
      const optimized = await compressAvatarImage(remoteBlob);
      if (!isSupportedAvatarValue(optimized)) {
        throw new Error("Optimized image payload is still too large");
      }
      setAvatarInput(optimized);
      toast({
        title: "Image imported",
        description:
          "Image downloaded from the link and optimized for your profile.",
      });
      return optimized;
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not import image",
        description:
          error instanceof Error
            ? error.message
            : "Try another public image URL.",
      });
      return null;
    } finally {
      setIsProcessingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    const username = usernameInput.trim();
    let avatar = normalizeAvatarValue(avatarInput);
    const currentUsername = profile?.username || user?.username || "";
    const currentAvatar = profile?.avatar_url || user?.avatar_url || null;

    if (!USERNAME_REGEX.test(username)) {
      toast({
        variant: "destructive",
        title: "Invalid username",
        description:
          "Username must be 3-24 characters and only include letters, numbers, or underscores.",
      });
      return;
    }

    if (
      avatar !== (currentAvatar || "") &&
      avatar &&
      !isSupportedAvatarValue(avatar)
    ) {
      toast({
        variant: "destructive",
        title: "Invalid avatar",
        description:
          "Avatar must be a valid public http(s) URL or an uploaded PNG/JPG/WebP/GIF image.",
      });
      return;
    }

    setIsSavingProfile(true);
    try {
      if (isRemoteAvatarUrl(avatar)) {
        const importedAvatar = await importAvatarFromLink(avatar);
        if (!importedAvatar) return;
        avatar = importedAvatar;
      }

      const avatarForSave = (() => {
        if (!avatar) return null;
        const localAvatarPath = getLocalAvatarPath(avatar);
        if (localAvatarPath && typeof window !== "undefined") {
          return `${window.location.origin}${localAvatarPath}`;
        }
        return avatar;
      })();

      const updates: { username?: string; avatar_url?: string | null } = {};
      if (username !== currentUsername) {
        updates.username = username;
      }
      if (avatarForSave !== currentAvatar) {
        updates.avatar_url = avatarForSave;
      }

      if (!updates.username && !("avatar_url" in updates)) {
        setEditOpen(false);
        return;
      }

      const updated = await updateProfile(updates);

      if (updated) {
        setEditOpen(false);
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
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

    try {
      setIsProcessingAvatar(true);
      const optimized = await compressAvatarImage(file);
      if (!isSupportedAvatarValue(optimized)) {
        throw new Error("Optimized image payload is still too large");
      }
      setAvatarInput(optimized);
      toast({
        title: "Avatar optimized",
        description:
          "Image cropped and compressed to a smaller WebP profile image.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: "Could not optimize this image. Try a smaller file.",
      });
    } finally {
      setIsProcessingAvatar(false);
    }
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
                    <AvatarImage
                      key={avatarUrl || "profile-avatar"}
                      src={avatarUrl || undefined}
                      alt={`${displayName} avatar`}
                    />
                    <AvatarFallback className="text-xl font-bold bg-gradient-to-br from-primary to-secondary text-primary-foreground">
                      {getInitials(displayName)}
                    </AvatarFallback>
                  </Avatar>

                  <div>
                    <Badge
                      variant="secondary"
                      className="mb-2 bg-primary/15 text-primary"
                    >
                      <UserRound className="h-3.5 w-3.5 mr-1" />
                      Profile
                    </Badge>
                    <h1 className="text-3xl md:text-4xl font-bold leading-tight">
                      {displayName}
                    </h1>
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
                    onClick={() => handleEditOpenChange(true)}
                  >
                    <Camera className="w-4 h-4" />
                    Edit Profile
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSignOut}
                    className="gap-2"
                  >
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
                    <p className="text-muted-foreground mb-4">
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
                    <p className="text-muted-foreground mb-4">
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

      <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent className="w-[calc(100vw-1rem)] max-h-[calc(100dvh-1rem)] max-w-5xl gap-0 overflow-hidden border-border/70 bg-background p-0 sm:w-full sm:max-h-[calc(100dvh-3rem)]">
          <div className="grid min-h-0 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="relative overflow-hidden border-b border-border/70 bg-gradient-to-br from-card via-card to-primary/10 p-5 sm:p-6 lg:border-b-0 lg:border-r">
              <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
              <div className="absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-secondary/20 blur-3xl" />
              <div className="relative flex h-full flex-col gap-5">
                <Badge
                  variant="secondary"
                  className="w-fit bg-background/75 text-foreground backdrop-blur-sm"
                >
                  <UserRound className="mr-1 h-3.5 w-3.5" />
                  Profile Editor
                </Badge>

                <div className="rounded-[28px] border border-white/10 bg-background/60 p-5 shadow-2xl backdrop-blur-md">
                  <div className="flex flex-col items-center gap-4 text-center">
                    <Avatar className="h-32 w-32 border-4 border-background shadow-xl">
                      <AvatarImage
                        key={previewAvatar || "profile-preview"}
                        src={previewAvatar}
                        alt="Profile preview"
                      />
                      <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-xl font-semibold text-primary-foreground">
                        {getInitials(usernameInput || displayName)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="space-y-2">
                      <p className="text-2xl font-semibold">
                        {usernameInput.trim() || displayName}
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <Badge className="bg-primary/15 text-primary hover:bg-primary/15">
                          {avatarStatusLabel}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="border-white/15 bg-background/50"
                        >
                          Since {memberSince}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                <input
                  ref={avatarFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11 gap-2"
                    disabled={isProcessingAvatar}
                    onClick={() => avatarFileInputRef.current?.click()}
                  >
                    <Camera className="h-4 w-4" />
                    {isProcessingAvatar && !isRemoteLinkedAvatar
                      ? "Optimizing..."
                      : "Upload"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    onClick={() => setAvatarInput("")}
                  >
                    Use Initials
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  PNG, JPG, WebP, GIF • 3MB max
                </p>
              </div>
            </aside>

            <div className="flex min-h-0 flex-col">
              <DialogHeader className="border-b border-border/70 px-5 py-5 pr-14 text-left sm:px-6">
                <DialogTitle className="text-xl">Edit Profile</DialogTitle>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                <div className="space-y-5">
                  <section className="rounded-3xl border border-border/70 bg-card/55 p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Username
                        </p>
                        <Label htmlFor="profile-username" className="sr-only">
                          Username
                        </Label>
                      </div>
                      <Badge variant="outline" className="border-border/70">
                        {usernameInput.trim().length || 0}/24
                      </Badge>
                    </div>
                    <Input
                      id="profile-username"
                      value={usernameInput}
                      onChange={(event) => setUsernameInput(event.target.value)}
                      placeholder="Your username"
                      maxLength={24}
                      className="mt-3 h-12 bg-background/70 text-base"
                    />
                  </section>

                  <section className="rounded-3xl border border-border/70 bg-card/55 p-5 shadow-sm">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Image Link
                      </p>
                      {isRemoteLinkedAvatar ? (
                        <Badge className="bg-secondary/15 text-secondary hover:bg-secondary/15">
                          Ready
                        </Badge>
                      ) : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                      <Input
                        id="profile-avatar-url"
                        value={avatarInputValue}
                        onChange={(event) => setAvatarInput(event.target.value)}
                        placeholder="https://example.com/avatar.jpg"
                        className="h-11 bg-background/70"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-11"
                        disabled={!isRemoteLinkedAvatar || isProcessingAvatar}
                        onClick={() => void importAvatarFromLink()}
                      >
                        {isProcessingAvatar && isRemoteLinkedAvatar
                          ? "Importing..."
                          : "Import"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11"
                        disabled={!normalizedAvatarInput}
                        onClick={() => setAvatarInput("")}
                      >
                        Clear
                      </Button>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-border/70 bg-card/55 p-5 shadow-sm">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Avatar Gallery
                      </p>
                      {isDefaultAvatar ? (
                        <Badge className="bg-primary/15 text-primary hover:bg-primary/15">
                          Selected
                        </Badge>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {DEFAULT_AVATAR_OPTIONS.map((candidate) => {
                        const isSelected = isDefaultAvatarSelected(
                          normalizedAvatarInput,
                          candidate.url,
                        );

                        return (
                          <button
                            key={candidate.id}
                            type="button"
                            onClick={() => setAvatarInput(candidate.url)}
                            className={cn(
                              "group rounded-[22px] border border-border bg-background/65 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-background",
                              isSelected && "border-primary ring-2 ring-primary/25",
                            )}
                          >
                            <div className="relative mb-3 overflow-hidden rounded-2xl border border-border/60 bg-muted/40">
                              {isSelected ? (
                                <span className="absolute right-2 top-2 z-10 rounded-full bg-background/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                                  Selected
                                </span>
                              ) : null}
                              <img
                                src={candidate.url}
                                alt={candidate.label}
                                className="h-28 w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                                loading="lazy"
                              />
                            </div>
                            <p className="text-sm font-medium">{candidate.label}</p>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                </div>
              </div>

              <DialogFooter className="border-t border-border/70 px-5 py-4 sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleEditOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveProfile}
              disabled={isSavingProfile || isProcessingAvatar}
            >
              {isSavingProfile ? "Saving..." : "Save Changes"}
            </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Footer />
      <BottomNav />
    </div>
  );
}
