import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Film, Sparkles } from "lucide-react";

export default function Welcome() {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { setUsername } = useUser();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    setUsername(name.trim());
    
    // Small delay for animation
    setTimeout(() => {
      navigate("/home");
    }, 300);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background gradient effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 -left-1/4 w-1/2 h-1/2 bg-primary/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-secondary/10 rounded-full blur-[100px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Film className="w-10 h-10 text-primary" />
            <h1 className="text-4xl font-bold text-gradient">MovieReckon</h1>
          </div>
          <p className="text-muted-foreground text-center">
            Your personalized gateway to Bollywood & Hollywood
          </p>
        </div>

        {/* Welcome Card */}
        <div className="bg-card/50 backdrop-blur-xl rounded-2xl p-8 border border-border/50 shadow-2xl">
          <div className="flex items-center gap-2 mb-6">
            <Sparkles className="w-5 h-5 text-accent" />
            <h2 className="text-xl font-semibold">Welcome!</h2>
          </div>

          <p className="text-muted-foreground mb-6">
            Enter your name to get personalized movie recommendations based on your viewing history.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="text"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-12 text-lg bg-background/50 border-border/50 focus:border-primary"
                autoFocus
                maxLength={50}
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-lg font-semibold bg-primary hover:bg-primary/90 glow-primary transition-all duration-300"
              disabled={!name.trim() || isSubmitting}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Loading...
                </span>
              ) : (
                "Continue"
              )}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-muted-foreground text-sm mt-6">
          Discover movies from Bollywood & Hollywood 🎬
        </p>
      </div>
    </div>
  );
}
