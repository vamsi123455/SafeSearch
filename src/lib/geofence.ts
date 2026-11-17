import {LatLngPoint} from '../types/safereach';

const EARTH_RADIUS_METERS = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Computes great-circle distance in meters between two WGS84 coordinates.
 */
export function haversineDistanceMeters(a: LatLngPoint, b: LatLngPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);

  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Computes minimum distance in meters from point `p` to a line segment `a -> b`
 * using local equirectangular projection (accurate at city/regional scales).
 */
function distancePointToSegmentMeters(
  p: LatLngPoint,
  a: LatLngPoint,
  b: LatLngPoint
): number {
  const cosLat = Math.cos(toRad((a.lat + b.lat) / 2));
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * cosLat;

  const ax = 0;
  const ay = 0;
  const bx = (b.lng - a.lng) * mPerDegLng;
  const by = (b.lat - a.lat) * mPerDegLat;
  const px = (p.lng - a.lng) * mPerDegLng;
  const py = (p.lat - a.lat) * mPerDegLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return Math.hypot(px, py);
  }

  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;

  return Math.hypot(px - projX, py - projY);
}

/**
 * Returns minimum distance in meters from a coordinate to a polyline path.
 */
export function distanceToPolylineMeters(
  point: LatLngPoint,
  path: LatLngPoint[]
): number {
  if (path.length === 0) return 0;
  if (path.length === 1) return haversineDistanceMeters(point, path[0]);

  let minDistance = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const dist = distancePointToSegmentMeters(point, path[i], path[i + 1]);
    if (dist < minDistance) {
      minDistance = dist;
    }
  }
  return minDistance;
}

/**
 * Encodes an array of LatLng points using Google's Encoded Polyline Algorithm.
 */
export function encodePolyline(points: LatLngPoint[]): string {
  let prevLat = 0;
  let prevLng = 0;
  let result = '';

  const encodeValue = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 0x20) {
      result += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    result += String.fromCharCode(v + 63);
  };

  for (const point of points) {
    const lat = Math.round(point.lat * 1e5);
    const lng = Math.round(point.lng * 1e5);
    encodeValue(lat - prevLat);
    encodeValue(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }

  return result;
}

/**
 * Decodes a Google Encoded Polyline string into LatLng points.
 */
export function decodePolyline(encoded: string): LatLngPoint[] {
  if (!encoded) return [];
  const points: LatLngPoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < encoded.length);
    const dLat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dLat;

    shift = 0;
    result = 0;
    while (index < encoded.length) {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
      if (b < 0x20) break;
    }
    const dLng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dLng;

    points.push({lat: lat / 1e5, lng: lng / 1e5});
  }

  return points;
}

export function densifyPolyline(
  points: LatLngPoint[],
  maxSegmentMeters = 20
): LatLngPoint[] {
  if (points.length < 2) return points;
  const result: LatLngPoint[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    const dist = haversineDistanceMeters(start, end);
    const steps = Math.max(1, Math.ceil(dist / maxSegmentMeters));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      result.push({
        lat: start.lat + (end.lat - start.lat) * t,
        lng: start.lng + (end.lng - start.lng) * t,
      });
    }
  }
  return result;
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '0 m';
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatTimeShort(date: Date | null | undefined): string {
  if (!date) return 'Just now';
  return date.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
}

export function formatTimeWithSeconds(date: Date | null | undefined): string {
  if (!date) return 'Just now';
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatRelativeAge(
  date: Date | null | undefined,
  nowMs = Date.now()
): string {
  if (!date) return 'Just now';
  const diffSec = Math.max(0, Math.floor((nowMs - date.getTime()) / 1000));
  if (diffSec <= 1) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return date.toLocaleDateString([], {month: 'short', day: 'numeric'});
}

