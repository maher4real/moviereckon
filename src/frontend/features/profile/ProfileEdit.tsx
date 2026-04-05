import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/frontend/components/BottomNav";
import Footer from "@/frontend/components/Footer";
import Header from "@/frontend/components/Header";
import { AppPageSkeleton } from "@/frontend/components/AppSkeletons";
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
import { ArrowLeft, Camera, UserRound } from "lucide-react";

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
  const [defaultAvatarValues, setDefaultAvatarValues] = useState<
    Record<string, string>
  >({});
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setUsernameInput(profile?.username || user?.username || "");
    setAvatarInput(normalizeAvatarValue(profile?.avatar_url || ""));
  }, [profile?.avatar_url, profile?.username, user?.avatar_url, user?.username]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    setDefaultAvatarValues(
      Object.fromEntries(
        DEFAULT_AVATAR_OPTIONS.map((candidate) => [
          candidate.id,
          createDefaultAvatarDataUrl(candidate.id),
        ]),
      ),
    );
  }, []);

  const displayName = profile?.username || user?.username || "User";
  const currentAvatar = profile?.avatar_url || user?.avatar_url || null;
  const normalizedAvatarInput = normalizeAvatarValue(avatarInput);
  const selectedDefaultAvatar =
    DEFAULT_AVATAR_OPTIONS.find((candidate) =>
      isDefaultAvatarSelected(
        normalizedAvatarInput,
        defaultAvatarValues[candidate.id] ||
          createDefaultAvatarDataUrl(candidate.id),
      ),
    ) || null;
  const selectedAvatarValue = normalizedAvatarInput || currentAvatar || "";
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
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header />

      <main className="flex-1 pt-20 pb-12">
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

              <section className="rounded-3xl border border-border/70 bg-card/65 p-5 shadow-sm">
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

                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {DEFAULT_AVATAR_OPTIONS.map((candidate) => {
                    const candidateValue =
                      defaultAvatarValues[candidate.id] ||
                      createDefaultAvatarDataUrl(candidate.id);
                    const isSelected = isDefaultAvatarSelected(
                      normalizedAvatarInput,
                      candidateValue,
                    );

                    return (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => setAvatarInput(candidateValue)}
                        className={cn(
                          "group rounded-3xl border border-border bg-background/70 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-background",
                          isSelected && "border-primary ring-2 ring-primary/25",
                        )}
                      >
                        <div className="relative mb-3 overflow-hidden rounded-2xl border border-border/60 bg-muted/40">
                          {isSelected ? (
                            <span className="absolute right-2 top-2 z-10 rounded-full bg-background/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                              Selected
                            </span>
                          ) : null}
                          <div
                            aria-hidden="true"
                            className="relative h-32 w-full overflow-hidden transition-transform duration-300 group-hover:scale-[1.03]"
                            style={{
                              backgroundImage: `linear-gradient(135deg, ${candidate.colors[0]} 0%, ${candidate.colors[1]} 55%, ${candidate.colors[2]} 100%)`,
                            }}
                          >
                            <div
                              className="absolute -right-5 -top-5 h-20 w-20 rounded-full blur-2xl"
                              style={{ backgroundColor: candidate.glow }}
                            />
                            <div className="absolute left-3 top-3 h-7 w-16 rounded-full border border-white/20 bg-white/14" />
                            <div
                              className="absolute inset-x-4 bottom-4 rounded-[22px] border border-white/16 p-3 backdrop-blur-sm"
                              style={{ backgroundColor: candidate.surface }}
                            >
                              <div
                                className="h-2.5 w-16 rounded-full"
                                style={{ backgroundColor: candidate.accent }}
                              />
                              <div className="mt-2 flex items-center gap-2">
                                <div className="h-9 w-9 rounded-2xl bg-white/14" />
                                <div className="min-w-0 flex-1 space-y-1.5">
                                  <div className="h-2.5 rounded-full bg-white/24" />
                                  <div className="h-2.5 w-2/3 rounded-full bg-white/16" />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <p className="text-sm font-medium">{candidate.label}</p>
                      </button>
                    );
                  })}
                </div>
              </section>
            </section>
          </div>
        </div>
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}
