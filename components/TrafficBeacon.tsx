"use client";

import { useEffect } from "react";
import { rememberArrivalSource, sendTrafficEvent } from "@/lib/trafficClient";

/** Counts one arrival per browser-tab session (lib/trafficStats.ts). The
 * root layout stays mounted across client navigations, so this runs once
 * per full page load; sessionStorage stops a reload counting twice.
 * Renders nothing. */
export default function TrafficBeacon() {
  useEffect(() => {
    const source = rememberArrivalSource();
    if (source) sendTrafficEvent({ kind: "visit", source });
  }, []);
  return null;
}
