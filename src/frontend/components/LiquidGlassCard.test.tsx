import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-glass-ui", () => ({
  GlassCard: ({
    children,
    contentClassName,
  }: {
    children?: ReactNode;
    contentClassName?: string;
  }) => <div className={contentClassName}>{children}</div>,
}));

import LiquidGlassCard from "./LiquidGlassCard";

describe("LiquidGlassCard", () => {
  it("uses natural content height when no fixed height is provided", () => {
    render(<LiquidGlassCard contentClassName="custom-content">Flexible content</LiquidGlassCard>);

    expect(screen.getByText("Flexible content")).toHaveClass(
      "custom-content",
      "liquid-glass-auto-content",
    );
  });

  it("preserves the library sizing for explicitly sized glass", () => {
    render(<LiquidGlassCard height={120}>Fixed decorative glass</LiquidGlassCard>);

    expect(screen.getByText("Fixed decorative glass")).not.toHaveClass(
      "liquid-glass-auto-content",
    );
  });
});
