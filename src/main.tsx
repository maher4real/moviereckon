import { createRoot } from "react-dom/client";
import App from "./App.tsx";
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
if (rootElement) {
  createRoot(rootElement).render(<App />);
} else {
  console.error("Root element not found");
}
