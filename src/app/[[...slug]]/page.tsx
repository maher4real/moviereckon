"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";

const App = dynamic(() => import("@/App"), {
  ssr: false,
  loading: () => <div className="min-h-screen bg-background" />,
});

export default function SpaPage() {
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled rejection:", event.reason);
      event.preventDefault();
    };

    const handleGlobalError = (event: ErrorEvent) => {
      console.error("Uncaught error:", event.error);
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleGlobalError);

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("error", handleGlobalError);
    };
  }, []);

  return <App />;
}
