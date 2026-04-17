import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/frontend/components/Header";
import Footer from "@/frontend/components/Footer";
import BottomNav from "@/frontend/components/BottomNav";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import {
  ArrowLeft, Plus, Pencil, Trash2, X, Check,
  Star, Loader2, LogOut, Upload, ImageIcon,
  Film, User, Clapperboard,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { toast } from "sonner";
import { getAdminToken, clearAdminToken } from "@/frontend/features/admin/AdminLogin";

interface TheaterCastMember { name: string; role: string; photo: string; }

interface TheaterMovie {
  _id: string;
  title: string;
  description: string;
  thumbnail: string;
  genre: string;
  year: number;
  rating: number;
  videoUrl: string;
  source: "youtube" | "gdrive" | "dailymotion";
  cast: TheaterCastMember[];
  createdAt: string;
}

const EMPTY_FORM = {
  title: "",
  description: "",
  thumbnail: "",
  genre: "",
  year: new Date().getFullYear(),
  rating: 0,
  videoUrl: "",
  cast: [] as TheaterCastMember[],
};
type FormState = typeof EMPTY_FORM;
type View = "list" | "form";

function apiFetch(path: string, token: string, options?: RequestInit) {
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-requested-with": "XMLHttpRequest",
      Authorization: `Bearer ${token}`,
      ...(options?.headers || {}),
    },
    credentials: "include",
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error(err.error || "Request failed");
    }
    return res.json();
  });
}

async function fetchMovies(): Promise<TheaterMovie[]> {
  const res = await fetch("/api/theater", { headers: { "x-requested-with": "XMLHttpRequest" } });
  if (!res.ok) throw new Error("Failed");
  return (await res.json()).movies;
}

export default function TheaterAdmin() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<View>("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    const t = getAdminToken();
    if (!t) navigate("/admin", { replace: true });
    else setToken(t);
  }, [navigate]);

  const { data: movies = [], isLoading } = useQuery({
    queryKey: ["theater-movies"],
    queryFn: fetchMovies,
    staleTime: 1000 * 60 * 2,
    enabled: !!token,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: FormState & { id?: string }) => {
      const { id, ...body } = data;
      if (!token) throw new Error("Not authenticated");
      if (id) return apiFetch(`/api/theater/${id}`, token, { method: "PUT", body: JSON.stringify(body) });
      return apiFetch("/api/theater", token, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["theater-movies"] });
      setView("list");
      setEditingId(null);
      setForm(EMPTY_FORM);
      toast.success(editingId ? "Movie updated" : "Movie added");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      if (!token) throw new Error("Not authenticated");
      return apiFetch(`/api/theater/${id}`, token, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["theater-movies"] });
      setDeleteConfirm(null);
      toast.success("Movie deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openAdd = () => { setEditingId(null); setForm(EMPTY_FORM); setView("form"); };
  const openEdit = (m: TheaterMovie) => {
    setEditingId(m._id);
    setForm({ title: m.title, description: m.description, thumbnail: m.thumbnail, genre: m.genre, year: m.year, rating: m.rating, videoUrl: m.videoUrl, cast: m.cast || [] });
    setView("form");
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(editingId ? { ...form, id: editingId } : form);
  };
  const addCast = () => setForm((f) => ({ ...f, cast: [...f.cast, { name: "", role: "", photo: "" }] }));
  const updateCast = (i: number, field: keyof TheaterCastMember, val: string) =>
    setForm((f) => { const cast = [...f.cast]; cast[i] = { ...cast[i], [field]: val }; return { ...f, cast }; });
  const removeCast = (i: number) => setForm((f) => ({ ...f, cast: f.cast.filter((_, idx) => idx !== i) }));

  if (!token) return null;

  if (view === "form") {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Header />
        <main className="pt-16 pb-20 md:pb-0">
          <div className="container mx-auto px-4 md:px-8 py-6 max-w-5xl">
            {/* Page header */}
            <div className="flex items-center gap-4 mb-8">
              <Button variant="ghost" size="icon" onClick={() => setView("list")} className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">{editingId ? "Edit Movie" : "Add New Movie"}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Fill in the details below to {editingId ? "update" : "publish"} to Cinema</p>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* ── Left column: poster preview ── */}
                <div className="lg:col-span-1 space-y-4">
                  {/* Poster card */}
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <PosterPreview src={form.thumbnail} />
                    <div className="p-4 space-y-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Poster Image</p>
                      <ImageUploadField
                        value={form.thumbnail}
                        onChange={(url) => setForm((f) => ({ ...f, thumbnail: url }))}
                        token={token}
                        placeholder="Paste image URL..."
                        filenameHint="poster"
                      />
                    </div>
                  </div>

                  {/* Source badge */}
                  {form.videoUrl && (
                    <div className={cn(
                      "rounded-lg border px-4 py-3 flex items-center gap-3",
                      detectSource(form.videoUrl) === "youtube" ? "border-red-500/30 bg-red-500/5" :
                      detectSource(form.videoUrl) === "dailymotion" ? "border-purple-500/30 bg-purple-500/5" :
                      "border-blue-500/30 bg-blue-500/5"
                    )}>
                      <div className={cn("w-2 h-2 rounded-full",
                        detectSource(form.videoUrl) === "youtube" ? "bg-red-500" :
                        detectSource(form.videoUrl) === "dailymotion" ? "bg-purple-400" :
                        "bg-blue-400"
                      )} />
                      <span className="text-sm font-medium capitalize">{detectSource(form.videoUrl) ?? "Unknown"} source detected</span>
                    </div>
                  )}
                </div>

                {/* ── Right column: fields ── */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Basic info card */}
                  <div className="rounded-xl border border-border bg-card p-6 space-y-5">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Movie Info</h2>

                    <FormField label="Title" required>
                      <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Inception" required className="text-base" />
                    </FormField>

                    <FormField label="Description">
                      <textarea
                        value={form.description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        placeholder="Brief synopsis of the movie..."
                        rows={4}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none transition-colors"
                      />
                    </FormField>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField label="Genre">
                        <Input value={form.genre} onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))} placeholder="Action, Drama..." />
                      </FormField>
                      <FormField label="Release Year">
                        <Input type="number" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))} min={1900} max={2100} />
                      </FormField>
                    </div>

                    <FormField label="Rating (0–10)">
                      <div className="flex items-center gap-3">
                        <Input type="number" value={form.rating} onChange={(e) => setForm((f) => ({ ...f, rating: Number(e.target.value) }))} min={0} max={10} step={0.1} className="max-w-[120px]" />
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Star className="w-4 h-4 text-yellow-400" fill="currentColor" />
                          <span>{Number(form.rating).toFixed(1)} / 10</span>
                        </div>
                      </div>
                    </FormField>
                  </div>

                  {/* Video URL card */}
                  <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Video Source</h2>
                    <FormField label="Video URL" required>
                      <Input
                        value={form.videoUrl}
                        onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))}
                        placeholder="https://youtube.com/watch?v=... or https://dailymotion.com/video/..."
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Supports YouTube, Google Drive, and Dailymotion links. Source is auto-detected.
                      </p>
                    </FormField>
                  </div>

                  {/* Cast & Crew card */}
                  <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Cast &amp; Crew</h2>
                      <Button type="button" variant="outline" size="sm" onClick={addCast} className="gap-1.5 h-8 text-xs">
                        <Plus className="w-3.5 h-3.5" /> Add Person
                      </Button>
                    </div>

                    {form.cast.length === 0 ? (
                      <div className="flex flex-col items-center py-8 text-muted-foreground/40 gap-2">
                        <User className="w-8 h-8" />
                        <p className="text-xs">No cast members added yet</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {form.cast.map((member, i) => (
                          <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border border-border/50">
                            {/* Photo preview */}
                            <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden bg-muted border border-border flex items-center justify-center">
                              {member.photo ? (
                                <img
                                  src={`/api/theater/proxy-image?url=${encodeURIComponent(member.photo)}`}
                                  alt={member.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement | null)?.removeAttribute("style"); }}
                                />
                              ) : null}
                              <User className="w-4 h-4 text-muted-foreground/40" style={member.photo ? { display: "none" } : undefined} />
                            </div>
                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <Input value={member.name} onChange={(e) => updateCast(i, "name", e.target.value)} placeholder="Name" className="text-sm h-9" />
                              <Input value={member.role} onChange={(e) => updateCast(i, "role", e.target.value)} placeholder="Role (Actor, Director...)" className="text-sm h-9" />
                              <ImageUploadField
                                value={member.photo}
                                onChange={(url) => updateCast(i, "photo", url)}
                                token={token}
                                placeholder="Photo URL"
                                filenameHint="cast"
                                compact
                              />
                            </div>
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeCast(i)} className="text-muted-foreground hover:text-destructive flex-shrink-0 h-9 w-9">
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <Button type="submit" disabled={saveMutation.isPending} className="flex-1 btn-primary gap-2 h-11 text-base">
                      {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clapperboard className="w-4 h-4" />}
                      {saveMutation.isPending ? "Saving..." : editingId ? "Save Changes" : "Add to Cinema"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setView("list")} className="h-11 px-6">
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </main>
        <Footer />
        <BottomNav />
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="pt-16 pb-20 md:pb-0">
        <div className="container mx-auto px-4 md:px-8 py-6 max-w-5xl space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate("/theater")} className="text-muted-foreground">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold">Manage Cinema</h1>
                <p className="text-xs text-muted-foreground mt-0.5">{movies.length} movie{movies.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={openAdd} className="gap-2 btn-primary">
                <Plus className="w-4 h-4" /> Add Movie
              </Button>
              <Button variant="ghost" size="icon" onClick={() => { clearAdminToken(); navigate("/admin", { replace: true }); }} className="text-muted-foreground hover:text-destructive" title="Sign out">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Movie grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />)}
            </div>
          ) : movies.length === 0 ? (
            <div className="flex flex-col items-center py-24 gap-4 text-muted-foreground">
              <Film className="w-14 h-14 opacity-20" />
              <p className="text-sm">No movies yet.</p>
              <Button onClick={openAdd} variant="outline" className="gap-2">
                <Plus className="w-4 h-4" /> Add your first movie
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {movies.map((movie) => (
                <div key={movie._id} className="group flex gap-4 p-4 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors">
                  {/* Poster thumbnail */}
                  <div className="flex-shrink-0 w-16 h-24 rounded-lg overflow-hidden bg-muted border border-border">
                    {movie.thumbnail ? (
                      <img src={movie.thumbnail} alt={movie.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                        <Film className="w-6 h-6" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 py-1">
                    <p className="font-semibold truncate">{movie.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {movie.genre && <span className="text-xs text-muted-foreground">{movie.genre}</span>}
                      {movie.year > 0 && <span className="text-xs text-muted-foreground">· {movie.year}</span>}
                      <span className={cn("text-xs font-medium uppercase",
                        movie.source === "youtube" ? "text-red-400" :
                        movie.source === "dailymotion" ? "text-purple-400" :
                        "text-blue-400"
                      )}>
                        · {movie.source}
                      </span>
                    </div>
                    {movie.rating > 0 && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <Star className="w-3 h-3 text-yellow-400" fill="currentColor" />
                        <span className="text-xs text-muted-foreground">{movie.rating.toFixed(1)}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex-shrink-0 flex flex-col items-end justify-between py-1">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(movie)} className="h-8 w-8 text-muted-foreground hover:text-foreground">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      {deleteConfirm === movie._id ? (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(movie._id)} disabled={deleteMutation.isPending} className="h-8 w-8 text-destructive hover:bg-destructive/10">
                            {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(null)} className="h-8 w-8 text-muted-foreground">
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(movie._id)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function PosterPreview({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);

  // reset broken state when src changes
  const prevSrc = useRef(src);
  if (prevSrc.current !== src) {
    prevSrc.current = src;
    broken && setBroken(false);
  }

  return (
    <div className="aspect-[2/3] relative bg-muted flex items-center justify-center overflow-hidden">
      {src && !broken ? (
        <img
          src={src}
          alt="Poster"
          className="w-full h-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <div className="flex flex-col items-center gap-3 text-muted-foreground/40">
          <Film className="w-12 h-12" />
          <span className="text-xs">{broken ? "Image failed to load" : "Poster preview"}</span>
        </div>
      )}
    </div>
  );
}

function detectSource(url: string): "youtube" | "gdrive" | "dailymotion" | null {
  if (!url) return null;
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("drive.google.com")) return "gdrive";
  if (url.includes("dailymotion.com") || url.includes("dai.ly")) return "dailymotion";
  return null;
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground/80">
        {label}{required && <span className="text-primary ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

interface ImageUploadFieldProps {
  value: string;
  onChange: (url: string) => void;
  token: string;
  placeholder?: string;
  filenameHint?: string;
  compact?: boolean;
}

function ImageUploadField({ value, onChange, token, placeholder = "https://...", filenameHint = "image", compact = false }: ImageUploadFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Only image files supported"); return; }
    if (file.size > 5_000_000) { toast.error("Image must be under 5 MB"); return; }

    setUploading(true);
    try {
      const data_url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/theater/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data_url, filename: filenameHint }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      onChange(data.url);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (compact) {
    return (
      <div className="relative">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="text-sm h-9 pr-8" />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50" title="Upload from device">
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="flex-1" />
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="gap-1.5 flex-shrink-0 border-dashed h-9">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? "Uploading…" : "Upload"}
        </Button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
      {value && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-8 h-8 rounded border border-border overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
            <img src={value} alt="" className="w-full h-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            <ImageIcon className="w-3 h-3 text-muted-foreground/50" />
          </div>
          <span className="truncate max-w-[220px]">{value}</span>
          <button type="button" onClick={() => onChange("")} className="ml-auto text-muted-foreground hover:text-destructive flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
