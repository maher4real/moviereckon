import { useEffect, useReducer, useRef, useState } from "react";
import { checkWatchLinks } from "@/frontend/lib/mongodbClient";
import { canCheckWatchLink } from "@/shared/lib/watchSources";
import type { WatchLinkCheck, WatchSourceIdentity, WatchSourceLink } from "@/shared/types/watchSources";

const cache = new Map<string, WatchLinkCheck>();
const keyFor = (identity: WatchSourceIdentity | undefined, link: WatchSourceLink) => JSON.stringify([identity, link]);
const fresh = (check: WatchLinkCheck | undefined, now: number) => !!check && Date.parse(check.validUntil) > now;
function remember(key: string, check: WatchLinkCheck) {
  cache.delete(key); cache.set(key, check);
  while (cache.size > 500) cache.delete(cache.keys().next().value!);
}

/** Resolve only after the containing popup opens; never show candidates while checking. */
export function useWorkingWatchLinks(links: WatchSourceLink[], identity?: WatchSourceIdentity) {
  const forceNext = useRef(false);
  const [checks, setChecks] = useState<Record<string, WatchLinkCheck>>({});
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [cycle, nextCycle] = useReducer((value: number) => value + 1, 0);
  const inputKey = JSON.stringify({ identity, links: links.filter(canCheckWatchLink) });
  useEffect(() => {
    const input = JSON.parse(inputKey) as { identity?: WatchSourceIdentity; links: WatchSourceLink[] };
    if (!input.identity || !input.links.length) { setChecks({}); setError(false); setPending(false); return; }
    const force = forceNext.current;
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let paceTimer: ReturnType<typeof setTimeout> | undefined;
    const current: Record<string, WatchLinkCheck> = {};
    const queue = input.links.filter((link) => {
      const key = keyFor(input.identity, link), cached = cache.get(key);
      if (!force && fresh(cached, Date.now())) { current[key] = cached!; return false; }
      return true;
    });
    setChecks(current); setError(false); setPending(queue.length > 0);
    const run = async () => {
      try {
        for (let offset = 0; offset < queue.length && !controller.signal.aborted; offset += 4) {
          const started = Date.now();
          const batch = queue.slice(offset, offset + 4);
          let cooldown = 3100;
          try {
            const result = await checkWatchLinks(input.identity!, batch.map((link) => link.id), controller.signal, force);
            if (controller.signal.aborted) return;
            for (const link of batch) {
              const key = keyFor(input.identity, link);
              const check = result.find((item) => item.linkId === link.id && item.url === link.url);
              current[key] = check && fresh(check, Date.now()) ? check : { linkId: link.id, url: link.url, available: false, downloads: [],
                checkedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 30_000).toISOString() };
              remember(key, current[key]);
            }
            setChecks({ ...current }); setNow(Date.now());
          } catch (failure) {
            if (controller.signal.aborted) return;
            setError(true);
            // One failed batch must not stop the remaining sources. Respect the
            // API cooldown while retaining independently confirmed results.
            if (failure instanceof Error && "retryAfterMs" in failure && typeof failure.retryAfterMs === "number") cooldown = Math.max(cooldown, failure.retryAfterMs);
          }
          if (offset + 4 < queue.length) await new Promise<void>((resolve) => {
            const done = () => { controller.signal.removeEventListener("abort", done); resolve(); };
            controller.signal.addEventListener("abort", done, { once: true });
            paceTimer = setTimeout(done, Math.max(0, cooldown - (Date.now() - started)));
          });
        }
      } catch { if (!controller.signal.aborted) setError(true); }
      finally {
        if (!controller.signal.aborted) {
          forceNext.current = false; setPending(false);
          const expiry = Math.min(Date.now() + 120_000, ...Object.values(current).map((check) => Date.parse(check.validUntil)));
          retryTimer = setTimeout(nextCycle, Math.max(1000, expiry - Date.now()));
        }
      }
    };
    void run();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { controller.abort(); clearTimeout(retryTimer); clearTimeout(paceTimer); clearInterval(clock); };
  }, [inputKey, cycle]);
  const confirmed = identity ? links.flatMap((link) => {
    const check = checks[keyFor(identity, link)];
    return check?.available && fresh(check, now) ? [{ link, check }] : [];
  }) : [];
  const refresh = () => {
    forceNext.current = true;
    links.forEach((link) => cache.delete(keyFor(identity, link)));
    setChecks({}); setNow(Date.now()); nextCycle();
  };
  const reject = (link: WatchSourceLink) => {
    const key = keyFor(identity, link);
    const check: WatchLinkCheck = { linkId: link.id, url: link.url, available: false, downloads: [],
      checkedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 30_000).toISOString() };
    check.validUntil = new Date(Date.now() + 120_000).toISOString();
    remember(key, check); setChecks((previous) => ({ ...previous, [key]: check }));
  };
  const totalCount = identity ? links.filter(canCheckWatchLink).length : 0;
  const checkedCount = identity ? links.filter((link) => fresh(checks[keyFor(identity, link)], now)).length : 0;
  return { confirmed, isChecking: pending, isError: error, checkedCount, totalCount, refresh, reject };
}
