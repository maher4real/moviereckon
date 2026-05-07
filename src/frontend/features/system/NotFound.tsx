import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="app-page flex items-center justify-center px-4">
      <div className="empty-state max-w-md">
        <p className="page-kicker">404</p>
        <h1 className="mb-3 mt-1 text-3xl font-bold">Page not found</h1>
        <p className="mb-5 text-muted-foreground">The route you opened does not exist.</p>
        <a href="/" className="inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
