"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { GlassCard } from "react-glass-ui";
import { cn } from "@/shared/lib/utils";

type LiquidGlassCardProps = ComponentProps<typeof GlassCard>;

/**
 * Prevents react-glass-ui's generated SVG IDs from differing between the
 * server and client. The CSS fallback keeps the first paint visually stable,
 * then upgrades to the liquid-glass renderer after hydration.
 */
export default function LiquidGlassCard({
  children,
  className,
  contentClassName,
  width,
  height,
  blur = 12,
  borderRadius = 16,
  borderColor = "white",
  borderOpacity = 0.16,
  backgroundColor = "#12090c",
  backgroundOpacity = 0.58,
  ...props
}: LiquidGlassCardProps) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  if (hydrated) {
    return (
      <GlassCard
        {...props}
        width={width}
        height={height}
        blur={blur}
        borderRadius={borderRadius}
        borderColor={borderColor}
        borderOpacity={borderOpacity}
        backgroundColor={backgroundColor}
        backgroundOpacity={backgroundOpacity}
        className={className}
        contentClassName={contentClassName}
      >
        {children}
      </GlassCard>
    );
  }

  return (
    <div
      className={cn("overflow-hidden", className)}
      style={{
        width: width ?? "fit-content",
        height: height ?? "fit-content",
        borderRadius,
        border: `1px solid ${borderColor}`,
        borderColor: `color-mix(in srgb, ${borderColor} ${Math.round(borderOpacity * 100)}%, transparent)`,
        background: `color-mix(in srgb, ${backgroundColor} ${Math.round(backgroundOpacity * 100)}%, transparent)`,
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 18px 48px rgba(0, 0, 0, 0.25)",
        backdropFilter: `blur(${blur}px) saturate(1.25)`,
      }}
    >
      <div className={contentClassName}>{children}</div>
    </div>
  );
}
