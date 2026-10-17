import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "@/frontend/components/Footer";
import Header from "@/frontend/components/Header";
import { Avatar, AvatarFallback, AvatarImage } from "@/frontend/components/ui/avatar";
import { Badge } from "@/frontend/components/ui/badge";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { useAuth } from "@/frontend/hooks/useAuth";
import { useToast } from "@/frontend/hooks/use-toast";
import { importAvatarFromUrl, uploadAvatarAsset } from "@/frontend/lib/mongodbClient";
import {
  createDefaultAvatarDataUrl,
  compressAvatarImage,
  DEFAULT_AVATAR_OPTIONS,
  getInitials,
  isDefaultAvatarSelected,
  isRemoteAvatarUrl,
  isSupportedAvatarValue,
  normalizeAvatarValue,
  PROFILE_MAX_AVATAR_FILE_SIZE_BYTES,
  USERNAME_REGEX,
} from "@/frontend/lib/profileEditor";
import { cn } from "@/shared/lib/utils";
import { ArrowLeft, Camera, Check, UserRound } from "lucide-react";

export default function ProfileEdit() {
  const {
    user,
    profile,
    updateProfile,
  } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isProcessingAvatar, setIsProcessingAvatar] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [avatarInput, setAvatarInput] = useState("");
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setUsernameInput(profile?.username || user?.username || "");
    setAvatarInput(normalizeAvatarValue(profile?.avatar_url || user?.avatar_url || ""));
  }, [profile?.avatar_url, profile?.username, user?.avatar_url, user?.username]);

  const displayName = profile?.username || user?.username || "User";
  const currentAvatar = profile?.avatar_url || user?.avatar_url || null;
  const normalizedAvatarInput = normalizeAvatarValue(avatarInput);
  const selectedDefaultAvatar =
    DEFAULT_AVATAR_OPTIONS.find((candidate) =>
      isDefaultAvatarSelected(
        normalizedAvatarInput,
        createDefaultAvatarDataUrl(candidate.id),
      ),
    ) || null;
  const selectedAvatarValue = normalizedAvatarInput;
  const previewAvatar = selectedAvatarValue || undefined;
  const isDefaultAvatar = Boolean(selectedDefaultAvatar);
  const isUploadedAvatar =
    normalizedAvatarInput.startsWith("data:image/") && !isDefaultAvatar;
  const isRemoteLinkedAvatar = isRemoteAvatarUrl(normalizedAvatarInput);
  const avatarInputValue =
    isUploadedAvatar || isDefaultAvatar ? "" : normalizedAvatarInput;
  const avatarStatusLabel = isUploadedAvatar
    ? "Uploaded"
    : isRemoteLinkedAvatar
      ? "Link image"
      : isDefaultAvatar
        ? selectedDefaultAvatar?.label || "Gallery avatar"
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

  const currentUsername = profile?.username || user?.username || "";
  const isUsernameValid = USERNAME_REGEX.test(usernameInput.trim());
  const hasChanges = useMemo(() => {
    const normalizedCurrentAvatar = normalizeAvatarValue(currentAvatar || "");
    return (
      usernameInput.trim() !== currentUsername ||
      normalizedAvatarInput !== normalizedCurrentAvatar
    );
  }, [currentAvatar, currentUsername, normalizedAvatarInput, usernameInput]);

  const handleBack = () => navigate("/profile");

  const importAvatarFromLink = async (urlValue = avatarInput.trim()) => {
    const normalizedUrlValue = normalizeAvatarValue(urlValue);
    if (!isRemoteAvatarUrl(normalizedUrlValue)) {
      toast({
        variant: "destructive",
        title: "Invalid image link",
        description: "Paste a direct public http(s) image URL.",
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
        description: "Profile image updated.",
      });
      return optimized;
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not import image",
        description:
          error instanceof Error ? error.message : "Try another public image URL.",
      });
      return null;
    } finally {
      setIsProcessingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    const username = usernameInput.trim();
    let avatar = normalizeAvatarValue(avatarInput);

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
      avatar !== normalizeAvatarValue(currentAvatar || "") &&
      avatar &&
      !isSupportedAvatarValue(avatar)
    ) {
      toast({
        variant: "destructive",
        title: "Invalid avatar",
        description: "Use a public image URL or upload a supported image.",
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

      if (avatar.startsWith("data:image/")) {
        setIsProcessingAvatar(true);
        try {
          const uploadedAvatarUrl = await uploadAvatarAsset({
            dataUrl: avatar,
            filename: `${username || "user"}-avatar`,
          });
          avatar = uploadedAvatarUrl;
          setAvatarInput(uploadedAvatarUrl);
        } catch (error) {
          toast({
            variant: "destructive",
            title: "Avatar upload failed",
            description:
              error instanceof Error
                ? error.message
                : "Could not store your avatar image.",
          });
          return;
        } finally {
          setIsProcessingAvatar(false);
        }
      }

      const avatarForSave = (() => {
        if (!avatar) return null;
        if (avatar.startsWith("/avatars/") && typeof window !== "undefined") {
          return `${window.location.origin}${avatar}`;
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
        navigate("/profile", { replace: true });
        return;
      }

      const updated = await updateProfile(updates);
      if (updated) {
        navigate("/profile", { replace: true });
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
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

    if (file.size > PROFILE_MAX_AVATAR_FILE_SIZE_BYTES) {
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
        description: "Profile image updated.",
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

  return (
    <div className="app-page pb-20 md:pb-0">
      <Header />

      <main className="page-main">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <Button
                type="button"
                variant="ghost"
                onClick={handleBack}
                className="-ml-3 mb-2 w-fit gap-2 px-3"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Profile
              </Button>
              <h1 className="text-3xl font-bold tracking-tight">Edit Profile</h1>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={handleBack}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSaveProfile}
                disabled={
                  isSavingProfile ||
                  isProcessingAvatar ||
                  !isUsernameValid ||
                  !hasChanges
                }
              >
                {isSavingProfile ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
            <aside className="space-y-4 self-start">
              <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-linear-to-br from-card via-card to-primary/10 p-5 shadow-sm">
                <div className="absolute -right-12 -top-14 h-36 w-36 rounded-full bg-primary/20 blur-3xl" />
                <div className="absolute -bottom-16 -left-12 h-36 w-36 rounded-full bg-secondary/20 blur-3xl" />

                <div className="relative flex flex-col items-center gap-5 text-center">
                  <Badge
                    variant="secondary"
                    className="bg-background/75 text-foreground backdrop-blur-sm"
                  >
                    <UserRound className="mr-1 h-3.5 w-3.5" />
                    Editor
                  </Badge>

                  <Avatar className="h-32 w-32 border-4 border-background shadow-xl">
                    <AvatarImage src={previewAvatar} alt="Profile preview" />
                    <AvatarFallback className="bg-linear-to-br from-primary to-secondary text-xl font-semibold text-primary-foreground">
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
                        className="border-white/15 bg-background/55"
                      >
                        Since {memberSince}
                      </Badge>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-border/70 bg-card/65 p-4 shadow-sm">
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
                    variant="outline"
                    className="btn-brand-soft h-11 gap-2 border-primary/25"
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

                <p className="mt-3 text-xs text-muted-foreground">
                  PNG, JPG, WebP, GIF • 3MB max
                </p>
              </section>
            </aside>

            <section className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                <section className="rounded-3xl border border-border/70 bg-card/65 p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <Label
                      htmlFor="profile-username"
                      className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
                    >
                      Username
                    </Label>
                    <Badge variant="outline" className="border-border/70">
                      {usernameInput.trim().length}/24
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

                <section className="rounded-3xl border border-border/70 bg-card/65 p-5 shadow-sm">
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
                      variant="outline"
                      className="btn-brand-soft h-11 border-primary/25"
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
              </div>

              <section aria-labelledby="avatar-gallery-title" className="overflow-hidden rounded-2xl border border-white/10 bg-card/60">
                <div className="border-b border-white/8 px-4 py-5 sm:px-6">
                  <p className="mb-1 text-xs font-medium uppercase tracking-[0.16em] text-primary">Make it yours</p>
                  <h2 id="avatar-gallery-title" className="text-xl font-semibold tracking-tight">Choose your avatar</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Pick a face for your next film night.</p>
                </div>

                <div className="space-y-7 px-3 py-6 sm:px-5">
                  {[
                    { id: "cinema", title: "Cinema portraits", description: "A little main-character energy.", prefix: "cinema-" },
                    { id: "colour", title: "Colour characters", description: "Bright faces, big personalities.", prefix: "net-" },
                  ].map((collection) => (
                    <div key={collection.id} role="group" aria-labelledby={`avatar-${collection.id}`}>
                      <div className="mb-4 px-1">
                        <h3 id={`avatar-${collection.id}`} className="text-sm font-semibold">{collection.title}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">{collection.description}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                        {DEFAULT_AVATAR_OPTIONS.filter((candidate) => candidate.id.startsWith(collection.prefix)).map((candidate) => {
                          const candidateValue = createDefaultAvatarDataUrl(candidate.id);
                          const isSelected = isDefaultAvatarSelected(normalizedAvatarInput, candidateValue);
                          return (
                            <button
                              key={candidate.id}
                              type="button"
                              aria-label={`Choose ${candidate.label} avatar`}
                              aria-pressed={isSelected}
                              disabled={isSavingProfile || isProcessingAvatar}
                              onClick={() => setAvatarInput(candidateValue)}
                              className={cn(
                                "group flex min-w-0 flex-col items-center gap-3 rounded-xl border p-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait disabled:opacity-50",
                                isSelected ? "border-primary/60 bg-primary/10" : "border-transparent hover:border-white/15 hover:bg-white/5",
                              )}
                            >
                              <span className="relative block aspect-square w-full max-w-20">
                                <img src={candidate.path} alt="" width={80} height={80} className={cn("h-full w-full rounded-full object-cover ring-2 ring-offset-4 ring-offset-card", isSelected ? "ring-primary" : "ring-white/10 group-hover:ring-white/30")} />
                                {isSelected && <span className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground"><Check className="size-3.5" strokeWidth={3} aria-hidden="true" /></span>}
                              </span>
                              <span className={cn("w-full truncate text-center text-xs font-medium", isSelected ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")}>{candidate.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3 border-t border-white/8 bg-background/40 px-4 py-4 sm:px-6" aria-live="polite">
                  <Avatar className="size-10 shrink-0 border border-white/10">
                    <AvatarImage src={previewAvatar} alt="" />
                    <AvatarFallback>{getInitials(usernameInput || displayName)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{selectedDefaultAvatar ? `${selectedDefaultAvatar.label} selected` : avatarStatusLabel}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{hasChanges ? "Looking good? Select Save Changes to keep it." : "Choose an avatar to preview it here."}</p>
                  </div>
                </div>
              </section>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
