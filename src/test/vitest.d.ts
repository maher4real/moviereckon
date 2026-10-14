import "vitest";
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

// Vitest 5 exposes custom matchers through Matchers<R, T>. The current
// jest-dom Vitest declaration still extends the older Assertion<T> shape.
declare module "vitest" {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown>
    extends TestingLibraryMatchers<unknown, R> {}
}
