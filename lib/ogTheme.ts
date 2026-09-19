/** Colors for the OG image routes (app, app/story/[slug], app/play) — these
 * render server-side via next/og's ImageResponse (a Satori-based renderer),
 * which doesn't support CSS custom properties, so they can't reference
 * app/globals.css's tokens directly. Mirrors that file's light-mode values
 * only (an OG image preview always renders on a light background,
 * regardless of the sharer's or viewer's theme preference) — keep these
 * two files in sync by hand if the light-mode palette in app/globals.css
 * ever changes. */
export const ogTheme = {
  paper: "#f1ece0",
  ink: "#24302b",
  inkSoft: "#5b665f",
  inkFaint: "#8a9089",
} as const;
