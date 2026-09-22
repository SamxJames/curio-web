/** The localStorage key holding the "was this browser signed in last time a
 * session resolved?" display hint.
 *
 * It lives in its own module, NOT in lib/storage.ts, because that file is a
 * `"use client"` module and components/SessionHintInit.tsx is a Server
 * Component. A plain (non-component) export imported across that boundary
 * arrives as a client-reference proxy, not the string — so interpolating it
 * into SessionHintInit's inline script produced
 * `localStorage.getItem(undefined)`, silently disabling the pre-paint nav
 * selection in production. Nothing about that is visible in the source or
 * in a type check; it only shows in the built HTML. Keep this module free
 * of a `"use client"` directive so both sides can read the real value.
 *
 * lib/sessionHintKey.test.ts asserts SessionHintInit's rendered script
 * actually contains this key, which is the regression guard. */
export const SESSION_HINT_KEY = "curio:signedIn"; // "1" = signed in last time a session resolved
