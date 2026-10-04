export type View = { minLon: number; maxLon: number; minLat: number; maxLat: number };
/** A map dot as [lon, lat]. */
export type Dot = [number, number];

const KM_PER_DEG = 111.2;
const MIN_LON_SPAN = 30;
const MIN_LAT_SPAN = 18;
const PAD = 2.5;
const EARTH_RADIUS_KM = 6371;

/** Equirectangular projection of [lon, lat] into a width x height canvas covering `view`. */
export function project(
  [lon, lat]: Dot,
  view: View,
  width = 100,
  height = 100,
): [number, number] {
  const x = ((lon - view.minLon) / (view.maxLon - view.minLon)) * width;
  const y = ((view.maxLat - lat) / (view.maxLat - view.minLat)) * height;
  return [x, y];
}

/** Lon/lat box around a location: >= 30x18 degrees, padded to 2.5x the radius, clamped to the world. */
export function viewAround(map: { lat: number; lon: number; radiusKm: number }): View {
  const halfLat = Math.max((map.radiusKm * PAD) / KM_PER_DEG, MIN_LAT_SPAN / 2);
  const cosLat = Math.max(Math.cos((map.lat * Math.PI) / 180), 0.2);
  const halfLon = Math.max((map.radiusKm * PAD) / (KM_PER_DEG * cosLat), MIN_LON_SPAN / 2);
  return {
    minLon: Math.max(-180, map.lon - halfLon),
    maxLon: Math.min(180, map.lon + halfLon),
    minLat: Math.max(-90, map.lat - halfLat),
    maxLat: Math.min(90, map.lat + halfLat),
  };
}

export function dotsInView(dots: Dot[], view: View): Dot[] {
  return dots.filter(
    ([lon, lat]) =>
      lon >= view.minLon && lon <= view.maxLon && lat >= view.minLat && lat <= view.maxLat,
  );
}

/** True when the dot lies within `radiusKm` (haversine) of `centre`. */
export function isLit(dot: Dot, centre: { lat: number; lon: number }, radiusKm: number): boolean {
  const [lon, lat] = dot;
  const rad = Math.PI / 180;
  const dLat = (lat - centre.lat) * rad;
  const dLon = (lon - centre.lon) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(centre.lat * rad) * Math.cos(lat * rad) * Math.sin(dLon / 2) ** 2;
  const distance = 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
  return distance <= radiusKm;
}
