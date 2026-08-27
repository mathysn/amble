import type { Coord, RouteGeometry } from '@amble/shared';

export type Pt = { x: number; y: number };

/**
 * Projects a route's geographic coordinates into a fixed SVG viewBox so the
 * stylized paper map can draw it. Equirectangular projection (fine at walking
 * scale), fit to the box with padding, y flipped so north is up.
 */
export function projectRoute(
  route: RouteGeometry,
  width: number,
  height: number,
  padding = 24,
) {
  const lngs = route.coordinates.map((c) => c[0]);
  const lats = route.coordinates.map((c) => c[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  const midLat = (minLat + maxLat) / 2;
  const cos = Math.cos((midLat * Math.PI) / 180) || 1;
  const spanX = Math.max((maxLng - minLng) * cos, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);

  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;

  const project = (c: Coord): Pt => ({
    x: offsetX + (c.lng - minLng) * cos * scale,
    y: height - (offsetY + (c.lat - minLat) * scale),
  });

  const points = route.coordinates.map((c) => project({ lng: c[0]!, lat: c[1]! }));
  return { points, project };
}

/** A smooth cubic-bezier `d` string through the given points. */
export function smoothPath(points: Pt[]): string {
  if (points.length < 2) return '';
  if (points.length === 2) return `M${points[0]!.x} ${points[0]!.y} L${points[1]!.x} ${points[1]!.y}`;
  let d = `M${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1]!;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}
