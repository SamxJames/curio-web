import { classifySource, isTrafficSource, type TrafficEvent, type TrafficSource } from "./traffic";

const ARRIVAL_KEY = "curio:arrivalSource"; // sessionStorage: one arrival per tab session

/** Fire-and-forget. keepalive lets it finish if the page is closing (a
 * share sheet, a navigation). Analytics never throws into the caller. */
export function sendTrafficEvent(ev: TrafficEvent): void {
  try {
    void fetch("/api/traffic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ev),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // best-effort only
  }
}

/** Classifies this tab's arrival once and remembers it for the session.
 * Returns the source only on that first call, so the caller sends exactly
 * one visit; null afterwards, for an internal referrer, or when storage is
 * unavailable (private mode) — better to under-count than double-count. */
export function rememberArrivalSource(): TrafficSource | null {
  try {
    if (window.sessionStorage.getItem(ARRIVAL_KEY)) return null;
    // hostname, not host: classifySource compares against URL.hostname,
    // which carries no port.
    const source = classifySource(window.location.search, document.referrer, window.location.hostname);
    if (!source) return null;
    window.sessionStorage.setItem(ARRIVAL_KEY, source);
    return source;
  } catch {
    return null;
  }
}

/** The source to credit a signup to: this session's arrival, else direct. */
export function getArrivalSource(): TrafficSource {
  try {
    const stored = window.sessionStorage.getItem(ARRIVAL_KEY);
    return isTrafficSource(stored) ? stored : "direct";
  } catch {
    return "direct";
  }
}
