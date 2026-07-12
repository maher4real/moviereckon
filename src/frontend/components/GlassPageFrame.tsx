"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useReducedMotion } from "motion/react";
import { gsap } from "gsap";
import LiquidGlassCard from "@/frontend/components/LiquidGlassCard";

type GlassPageFrameProps = {
  children: ReactNode;
};

/**
 * Shared application atmosphere and route-level entrance motion.
 * The liquid-glass effect is deliberately limited to one decorative lens so
 * content-heavy catalog pages remain responsive.
 */
export default function GlassPageFrame({ children }: GlassPageFrameProps) {
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduceMotion || !frameRef.current) return;

    const context = gsap.context(() => {
      const page = frameRef.current?.querySelector<HTMLElement>("[data-page-entry]");
      const lens = frameRef.current?.querySelector<HTMLElement>("[data-glass-lens]");

      if (page) {
        gsap.fromTo(
          page,
          { autoAlpha: 0, y: 14, filter: "blur(3px)" },
          { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.42, ease: "power3.out" },
        );
      }

      if (lens) {
        gsap.fromTo(
          lens,
          { autoAlpha: 0, x: 28 },
          { autoAlpha: 0.9, x: 0, duration: 0.56, ease: "power3.out", delay: 0.04 },
        );
      }
    }, frameRef);

    return () => context.revert();
  }, [location.key, location.pathname, location.search, reduceMotion]);

  return (
    <div ref={frameRef} className="relative isolate min-h-screen overflow-x-clip">
      <div
        aria-hidden="true"
        data-glass-lens
        className="pointer-events-none absolute right-[-5.5rem] top-24 z-0 hidden opacity-90 md:block"
      >
        <LiquidGlassCard
          width={240}
          height={120}
          blur={18}
          distortion={12}
          chromaticAberration={1}
          borderRadius={36}
          borderColor="#ffffff"
          borderOpacity={0.16}
          backgroundColor="#16080d"
          backgroundOpacity={0.52}
          innerLightColor="#ffffff"
          innerLightOpacity={0.12}
          outerLightColor="#e11d48"
          outerLightOpacity={0.16}
          flexibility={0}
        />
      </div>
      <div data-page-entry className="relative z-10">
        {children}
      </div>
    </div>
  );
}
