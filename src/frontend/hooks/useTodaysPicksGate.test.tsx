import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTodaysPicksSession, useTodaysPicksGate } from "./useTodaysPicksGate";

describe("useTodaysPicksGate", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-17T10:00:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("allows the first visit, then stays quiet for the rest of the session", () => {
    const { result } = renderHook(() => useTodaysPicksGate("u1"));
    expect(result.current.allowed).toBe(true);
    act(() => result.current.markShown());
    expect(result.current.allowed).toBe(false);

    const again = renderHook(() => useTodaysPicksGate("u1"));
    expect(again.result.current.allowed).toBe(false);
  });

  it("shows again in a new browser session", () => {
    const first = renderHook(() => useTodaysPicksGate("u1"));
    act(() => first.result.current.markShown());
    window.sessionStorage.clear(); // new tab / browser restart
    expect(renderHook(() => useTodaysPicksGate("u1")).result.current.allowed).toBe(true);
  });

  it("shows again the next day within one long-lived tab", () => {
    const first = renderHook(() => useTodaysPicksGate("u1"));
    act(() => first.result.current.markShown());
    vi.setSystemTime(new Date("2026-10-18T09:00:00"));
    expect(renderHook(() => useTodaysPicksGate("u1")).result.current.allowed).toBe(true);
  });

  it("'Skip for today' survives a new session but not a new day", () => {
    const first = renderHook(() => useTodaysPicksGate("u1"));
    act(() => first.result.current.skipToday());
    window.sessionStorage.clear();
    expect(renderHook(() => useTodaysPicksGate("u1")).result.current.allowed).toBe(false);
    vi.setSystemTime(new Date("2026-10-18T09:00:00"));
    expect(renderHook(() => useTodaysPicksGate("u1")).result.current.allowed).toBe(true);
  });

  it("is per account and closed while signed out", () => {
    const first = renderHook(() => useTodaysPicksGate("u1"));
    act(() => first.result.current.markShown());
    expect(renderHook(() => useTodaysPicksGate("u2")).result.current.allowed).toBe(true);
    expect(renderHook(() => useTodaysPicksGate(undefined)).result.current.allowed).toBe(false);
  });

  it("signing out clears the session marker so the next login sees the card again", () => {
    const first = renderHook(() => useTodaysPicksGate("u1"));
    act(() => first.result.current.markShown());
    clearTodaysPicksSession();
    expect(renderHook(() => useTodaysPicksGate("u1")).result.current.allowed).toBe(true);
  });

  it("still works when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const { result } = renderHook(() => useTodaysPicksGate("u1"));
    expect(result.current.allowed).toBe(true);
    expect(() => act(() => result.current.markShown())).not.toThrow();
    vi.restoreAllMocks();
  });
});
