export const LOCATION_TASK = 'babomap-location';

/** How often the map re-fetches /api/status while in the foreground. */
export const POLL_INTERVAL_MS = 20_000;

/** A fix older than this is drawn as stale (iOS sends nothing while stationary). */
export const STALE_AFTER_MS = 2 * 60 * 60_000;

/** Offline queue cap; oldest points are dropped beyond this. */
export const QUEUE_MAX = 5000;

/** Points per upload request (server allows 1000). */
export const UPLOAD_BATCH = 500;

export const FETCH_TIMEOUT_MS = 15_000;

/** Marker avatars by user name, falling back to order in /api/status. */
export const AVATARS: Record<string, string> = { jon: '🐻', wife: '🐰' };
export const FALLBACK_AVATARS = ['🐻', '🐰', '🐥', '🐢'];

export const COLORS = {
  bg: '#FFF8F6',
  card: '#FFFFFF',
  pink: '#FF7A90',
  pinkSoft: '#FFE9EC',
  pinkStroke: 'rgba(255, 122, 144, 0.6)',
  pinkFill: 'rgba(255, 122, 144, 0.15)',
  staleStroke: 'rgba(184, 184, 184, 0.6)',
  staleFill: 'rgba(184, 184, 184, 0.15)',
  ink: '#2B2B2B',
  muted: '#8A8A8A',
  stale: '#B8B8B8',
  ok: '#4CAF7D',
  warn: '#E8A33D',
};
