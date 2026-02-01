import { createRoot } from "react-dom/client";
import "./index.css";

// Debug: Log environment variables status at startup
console.log("ENV Check:", {
  hasUrl: !!import.meta.env.VITE_SUPABASE_URL,
  hasKey: !!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  mode: import.meta.env.MODE,
});

// Global error handler for unhandled promise rejections
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled rejection:", event.reason);
  event.preventDefault();
});

// Global error handler for uncaught errors  
window.addEventListener("error", (event) => {
  console.error("Uncaught error:", event.error);
});

const rootElement = document.getElementById("root");

function renderFatal(message: string, details?: Record<string, unknown>) {
  console.error(message, details);
  if (!rootElement) return;

  createRoot(rootElement).render(
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">App failed to start</h1>
        <p className="mt-2 text-muted-foreground">{message}</p>
        {details ? (
          <pre className="mt-4 overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(details, null, 2)}
          </pre>
        ) : null}
        <button
          className="mt-4 inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    </div>
  );
}

(async () => {
  if (!rootElement) {
    renderFatal("Root element not found");
    return;
  }

  const env = {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    MODE: import.meta.env.MODE,
  };

  // If env vars are missing, importing App will crash immediately because the backend client
  // is initialized at module import time.
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    renderFatal("Backend configuration is missing in this build.", {
      hasUrl: !!env.VITE_SUPABASE_URL,
      hasKey: !!env.VITE_SUPABASE_PUBLISHABLE_KEY,
      mode: env.MODE,
    });
    return;
  }

  try {
    const mod = await import("./App.tsx");
    const App = mod.default;
    createRoot(rootElement).render(<App />);
  } catch (error) {
    renderFatal("Unexpected error while loading the application bundle.", {
      error: String(error),
    });
  }
})();
