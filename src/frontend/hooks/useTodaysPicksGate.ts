import { useCallback, useEffect, useState } from "react";
import { formatLocalDate } from "@/shared/lib/utils";

const SESSION_PREFIX = "moviereckon:todays-picks:session:";
const SKIP_PREFIX = "moviereckon:todays-picks:skip:";

function read(storage: "session" | "local", key: string): string | null {
  try {
    return (storage === "session" ? window.sessionStorage : window.localStorage).getItem(key);
  } catch {
    return null; // Private mode or blocked storage: behave as "not seen yet".
  }
}

function write(storage: "session" | "local", key: string, value: string) {
  try {
    (storage === "session" ? window.sessionStorage : window.localStorage).setItem(key, value);
  } catch {
    // Not being able to remember is fine; the card just may show again.
  }
}

/** Forget this browser session's "already shown" markers (called on sign-out). */
export function clearTodaysPicksSession() {
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(SESSION_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Nothing to clear.
  }
}

/**
 * Decides whether the "What to watch today" card may open: once per login
 * session, and never again on a day the viewer chose "Skip for today".
 * Storage is read after mount so server and first client render match.
 */
export function useTodaysPicksGate(userId: string | undefined) {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!userId) {
      setAllowed(false);
      return;
    }
    const today = formatLocalDate(new Date());
    const skipped = read("local", `${SKIP_PREFIX}${userId}`) === today;
    const shown = read("session", `${SESSION_PREFIX}${userId}`) === today;
    setAllowed(!skipped && !shown);
  }, [userId]);

  /** Record that the card was shown so later Home visits this session stay quiet. */
  const markShown = useCallback(() => {
    if (!userId) return;
    write("session", `${SESSION_PREFIX}${userId}`, formatLocalDate(new Date()));
    setAllowed(false);
  }, [userId]);

  /** "Skip for today": quiet for the rest of the day, even in a new session. */
  const skipToday = useCallback(() => {
    if (!userId) return;
    const today = formatLocalDate(new Date());
    write("local", `${SKIP_PREFIX}${userId}`, today);
    write("session", `${SESSION_PREFIX}${userId}`, today);
    setAllowed(false);
  }, [userId]);

  return { allowed, markShown, skipToday };
}
