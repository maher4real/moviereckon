import type { ReactNode } from "react";

/** Keep fixed navigation anchored to the viewport while routes change. */
export default function GlassPageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate min-h-screen overflow-x-clip">
      {children}
    </div>
  );
}
