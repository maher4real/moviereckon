import { createRoot } from "react-dom/client";
import { installGlobalSafeLogging } from "@/shared/lib/safeLogging";
import "@/index.css";
import App from "./App";

installGlobalSafeLogging();

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

if (!rootElement) {
  console.error("Root element not found");
} else {
  // Remove the inline loading screen once React takes over
  const inlineLoader = document.getElementById("app-loading");
  if (inlineLoader) inlineLoader.remove();

  createRoot(rootElement).render(<App />);
}
