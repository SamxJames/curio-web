import { Redis } from "@upstash/redis";

export const usingUpstash =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

/** Shared Upstash Redis client for every server-side data module (anonymous
 * subscribers, accounts, sessions, favorites). `null` when Upstash isn't
 * configured — callers fall back to their own local-only behavior, matching
 * the pattern this file replaces in lib/db.ts. */
export const redis = usingUpstash
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;
