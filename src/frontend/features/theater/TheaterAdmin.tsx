import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/frontend/components/Header";
import Footer from "@/frontend/components/Footer";
import BottomNav from "@/frontend/components/BottomNav";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { useAuth } from "@/frontend/hooks/useAuth";
import { ArrowLeft, Plus, Pencil, Trash2, X, Check, Star, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { toast } from "sonner";

interface TheaterCastMember {
  name: string;
  role: string;
  photo: string;
}

interface TheaterMovie {
  _id: string;
  title: string;
  description: string;
  thumbnail: string;
  genre: string;
  year: number;
  rating: number;
  videoUrl: string;
  source: "youtube" | "gdrive";
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

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      "x-requested-with": "XMLHttpRequest",
      ...(options?.headers || {}),
    },
    credentials: "include",
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

async function fetchMovies(): Promise<TheaterMovie[]> {
  const data = await apiFetch("/api/theater");
  return data.movies;
}

export default function TheaterAdmin() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: movies = [], isLoading } = useQuery({
    queryKey: ["theater-movies"],
    queryFn: fetchMovies,
    staleTime: 1000 * 60 * 2,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: FormState & { id?: string }) => {
      const { id, ...body } = data;
      if (id) {
        return apiFetch(`/api/theater/${id}`, { method: "PUT", body: JSON.stringify(body) });
      }
      return apiFetch("/api/theater", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["theater-movies"] });
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      toast.success(editingId ? "Movie updated" : "Movie added");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/theater/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["theater-movies"] });
      setDeleteConfirm(null);
      toast.success("Movie deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Header />
        <main className="pt-20 container mx-auto px-4 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-muted-foreground">Admin access required.</p>
        </main>
      </div>
    );
  }

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (movie: TheaterMovie) => {
    setEditingId(movie._id);
    setForm({
      title: movie.title,
      description: movie.description,
      thumbnail: movie.thumbnail,
      genre: movie.genre,
      year: movie.year,
      rating: movie.rating,
      videoUrl: movie.videoUrl,
      cast: movie.cast || [],
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(editingId ? { ...form, id: editingId } : form);
  };

  const addCastMember = () => {
    setForm((f) => ({ ...f, cast: [...f.cast, { name: "", role: "", photo: "" }] }));
  };

  const updateCastMember = (i: number, field: keyof TheaterCastMember, val: string) => {
    setForm((f) => {
      const cast = [...f.cast];
      cast[i] = { ...cast[i], [field]: val };
      return { ...f, cast };
    });
  };

  const removeCastMember = (i: number) => {
    setForm((f) => ({ ...f, cast: f.cast.filter((_, idx) => idx !== i) }));
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <main className="pt-16 pb-20 md:pb-0">
        <div className="container mx-auto px-4 md:px-8 py-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate("/theater")} className="text-muted-foreground">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="text-xl font-bold">Manage Cinema</h1>
            </div>
            <Button onClick={openAdd} className="gap-2 btn-primary">
              <Plus className="w-4 h-4" />
              Add Movie
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : movies.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p>No movies yet. Add one to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {movies.map((movie) => (
                <div key={movie._id} className="flex items-center gap-4 p-4 rounded-lg bg-card border border-border">
                  {movie.thumbnail && (
                    <img
                      src={movie.thumbnail}
                      alt={movie.title}
                      className="w-12 h-16 rounded object-cover flex-shrink-0 bg-muted"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{movie.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {movie.genre} · {movie.year} ·{" "}
                      <span className={cn("uppercase font-medium", movie.source === "youtube" ? "text-red-400" : "text-blue-400")}>
                        {movie.source}
                      </span>
                    </p>
                    {movie.rating > 0 && (
                      <p className="text-xs flex items-center gap-1 text-yellow-400 mt-0.5">
                        <Star className="w-3 h-3" fill="currentColor" />
                        {movie.rating.toFixed(1)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(movie)} className="text-muted-foreground hover:text-foreground">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {deleteConfirm === movie._id ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(movie._id)}
                          disabled={deleteMutation.isPending}
                          className="text-destructive hover:bg-destructive/10"
                        >
                          {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(null)} className="text-muted-foreground">
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(movie._id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowForm(false)} />
          <div className="relative ml-auto w-full max-w-lg h-full bg-background border-l border-border overflow-y-auto">
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold">{editingId ? "Edit Movie" : "Add Movie"}</h2>
                <Button type="button" variant="ghost" size="icon" onClick={() => setShowForm(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <Field label="Title *">
                <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Movie title" required />
              </Field>

              <Field label="Description">
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Short synopsis..."
                  rows={4}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
              </Field>

              <Field label="Poster URL">
                <Input value={form.thumbnail} onChange={(e) => setForm((f) => ({ ...f, thumbnail: e.target.value }))} placeholder="https://..." />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Genre">
                  <Input value={form.genre} onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))} placeholder="Action, Drama..." />
                </Field>
                <Field label="Year">
                  <Input type="number" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))} min={1900} max={2100} />
                </Field>
              </div>

              <Field label="Rating (0–10)">
                <Input type="number" value={form.rating} onChange={(e) => setForm((f) => ({ ...f, rating: Number(e.target.value) }))} min={0} max={10} step={0.1} />
              </Field>

              <Field label="Video URL * (YouTube or Google Drive)">
                <Input value={form.videoUrl} onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))} placeholder="https://youtube.com/watch?v=... or drive.google.com/..." required />
                <p className="text-xs text-muted-foreground mt-1">Source (youtube/gdrive) is auto-detected.</p>
              </Field>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Cast &amp; Crew</label>
                  <Button type="button" variant="ghost" size="sm" onClick={addCastMember} className="gap-1 text-xs">
                    <Plus className="w-3 h-3" /> Add
                  </Button>
                </div>
                {form.cast.map((member, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-start">
                    <Input value={member.name} onChange={(e) => updateCastMember(i, "name", e.target.value)} placeholder="Name" className="text-xs" />
                    <Input value={member.role} onChange={(e) => updateCastMember(i, "role", e.target.value)} placeholder="Role" className="text-xs" />
                    <Input value={member.photo} onChange={(e) => updateCastMember(i, "photo", e.target.value)} placeholder="Photo URL" className="text-xs" />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeCastMember(i)} className="text-muted-foreground hover:text-destructive h-9 w-9">
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={saveMutation.isPending} className="flex-1 btn-primary gap-2">
                  {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingId ? "Save Changes" : "Add Movie"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1">
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Footer />
      <BottomNav />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground/80">{label}</label>
      {children}
    </div>
  );
}
