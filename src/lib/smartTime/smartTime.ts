import type { MatchEvent } from '@/types/match';
import type { SmartTimeConfig } from '@/types/match';

// ─────────────────────────────────────────────
// SMART TIME — VIDEO TIMESTAMP ASSIGNMENT
//
// DV4 encodes actions in sequence during live scouting.
// The video timestamp for each event is assigned retrospectively
// by working backwards from a known sync point.
//
// Strategy:
// 1. User marks video timestamp of last event in sequence (or serve)
// 2. Algorithm distributes timestamps to preceding events
//    using fixed inter-event durations
// 3. Timestamps can be corrected later via video playback
// ─────────────────────────────────────────────

export const DEFAULT_SMART_TIME: SmartTimeConfig = {
  serveToFirstAttackMs: 3000,
  attackToAttackMs: 3200,
  lastAttackToEndMs: 3000,
  receptionToSetMs: 1000,
  setToAttackMs: 1500,
};

// ─────────────────────────────────────────────
// ASSIGN TIMESTAMPS TO A RALLY
// ─────────────────────────────────────────────

export function assignRallyVideoTimestamps(
  events: MatchEvent[],
  anchorVideoTsMs: number,    // video timestamp of the anchor event (e.g. serve)
  anchorEventType: 'serve' | 'end',
  config: SmartTimeConfig = DEFAULT_SMART_TIME,
): Map<string, number> {
  const result = new Map<string, number>();
  if (events.length === 0) return result;

  // Sort by sequence
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);

  if (anchorEventType === 'serve') {
    // Forward assignment: serve is at anchorVideoTsMs, subsequent events add up
    let currentTs = anchorVideoTsMs;
    for (const ev of sorted) {
      result.set(ev.id, currentTs);
      currentTs += getInterEventGap(ev, config);
    }
  } else {
    // Backward assignment: last event is at anchorVideoTsMs
    let currentTs = anchorVideoTsMs;
    for (const ev of [...sorted].reverse()) {
      result.set(ev.id, currentTs);
      currentTs -= getInterEventGap(ev, config);
    }
  }

  return result;
}

function getInterEventGap(event: MatchEvent, config: SmartTimeConfig): number {
  const skill = event.payload.skill as string | undefined;
  switch (skill) {
    case 'S': return config.serveToFirstAttackMs;
    case 'R': return config.receptionToSetMs ?? 1000;
    case 'E': return config.setToAttackMs ?? 1500;
    case 'A': return config.attackToAttackMs;
    case 'B': return config.lastAttackToEndMs;
    default:  return 2000;
  }
}

// ─────────────────────────────────────────────
// VIDEO SYNC STATE
// Stores the current video sync offset + playback position
// ─────────────────────────────────────────────

export interface VideoSyncState {
  videoPath: string | null;
  syncOffsetMs: number;        // video frame offset for first serve
  currentVideoTsMs: number;   // current video position
  isPlaying: boolean;
  playbackRate: number;
}

export const initialVideoSync: VideoSyncState = {
  videoPath: null,
  syncOffsetMs: 0,
  currentVideoTsMs: 0,
  isPlaying: false,
  playbackRate: 1,
};

// ─────────────────────────────────────────────
// SYNC POINT CALCULATION
//
// Given a video timestamp where the user positioned the playhead
// and the serve event sequence number, calculate the offset.
// ─────────────────────────────────────────────

export function calculateSyncOffset(
  videoTsAtServe: number,
  serveWallClockMs: number,
): number {
  return videoTsAtServe - serveWallClockMs;
}

// Convert a wall clock event timestamp to a video timestamp
export function wallClockToVideoTs(wallClockMs: number, syncOffsetMs: number): number {
  return wallClockMs + syncOffsetMs;
}

// Find the event closest to a given video timestamp
export function findEventAtVideoTs(
  events: MatchEvent[],
  videoTsMs: number,
  syncOffsetMs: number,
  toleranceMs = 2000,
): MatchEvent | null {
  let closest: MatchEvent | null = null;
  let minDiff = Infinity;

  for (const ev of events) {
    const evVideoTs = ev.videoTsMs ?? wallClockToVideoTs(ev.timestampMs, syncOffsetMs);
    const diff = Math.abs(evVideoTs - videoTsMs);
    if (diff < minDiff && diff <= toleranceMs) {
      minDiff = diff;
      closest = ev;
    }
  }

  return closest;
}
