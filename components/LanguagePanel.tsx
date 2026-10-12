"use client";

import { useMemo } from "react";
import { findSheet } from "@/lib/languages/lookup";
import { panelModel } from "@/lib/languages/panel";
import LanguagePanelView from "./LanguagePanelView";

/** "About {language}" on Collection. Loaded with next/dynamic from CollectionScreen, so
 * this is the only place the sheets (data.ts, via findSheet/panelModel) are pulled in; the
 * land dots load only once the map mounts. None of it is in the page's first JS. */
export default function LanguagePanel({
  id,
  name,
  favouriteLineages,
}: {
  id: string;
  name: string; // canonical name from SHEET_NAMES
  favouriteLineages: string[][];
}) {
  const sheet = findSheet(name);
  const model = useMemo(
    () => (sheet ? panelModel(sheet, favouriteLineages) : null),
    [sheet, favouriteLineages],
  );
  if (!sheet || !model) return null;
  return <LanguagePanelView id={id} sheet={sheet} model={model} />;
}
