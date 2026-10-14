import * as domMatchers from "@testing-library/jest-dom/matchers";
import { expect, vi } from "vitest";

expect.extend(domMatchers);

vi.mock("server-only", () => ({}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
