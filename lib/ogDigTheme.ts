import { STRATUM_HEX } from "./dig/strata";

/** next/og can't read CSS variables (see lib/ogTheme.ts), so the dig's target-brand
 * colours are repeated here. Keep in sync with app/globals.css's [data-brand="next"]. */
export const ogDigTheme = { paper: "#F5F1E8", ink: "#1C1A17", inkSoft: "#5E5850", strata: STRATUM_HEX } as const;
