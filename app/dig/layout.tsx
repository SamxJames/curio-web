// Self-hosted like the site's other fonts (app/layout.tsx): no build-time fetch.
import "@fontsource/libre-caslon-text/700.css";

/** Scopes the target brand to the game (architecture §11, decided 2026-10-24). The site
 * header and footer outside this wrapper keep the current brand. */
export default function DigLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-brand="next" className="h-full bg-paper text-ink">
      {children}
    </div>
  );
}
