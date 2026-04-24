// Cloud sync — publish a match to Supabase for dashboard sharing.
//
// Schema (Supabase):
//   shared_matches (
//     id         uuid primary key default gen_random_uuid(),
//     share_id   text unique not null,   -- short slug, 8 chars
//     org_id     text,
//     match_id   text not null,
//     payload    jsonb not null,         -- full event log + metadata
//     published_at timestamptz default now(),
//     expires_at   timestamptz           -- optional TTL
//   )
//
// Row Level Security: SELECT is public (anon key); INSERT requires service key.
// The app ships with the anon key for reading; the service key is stored in
// Tauri's OS keychain (never in source code).

import { invoke } from '@tauri-apps/api/core';
import type { MatchStats } from '@/lib/analytics/stats';
import type { MatchEvent } from '@/types/match';

export interface SharePayload {
  version: 1;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  events: MatchEvent[];
  stats?: MatchStats;
}

export interface ShareResult {
  shareId: string;
  url: string;
}

// ─────────────────────────────────────────────
// PUBLISH
// ─────────────────────────────────────────────

/**
 * Publish match data to Supabase and return a share URL.
 * The Supabase URL + service key are read from the OS keychain via Rust.
 */
export async function publishMatch(payload: SharePayload): Promise<ShareResult> {
  const result = await invoke<{ share_id: string; url: string }>('publish_to_cloud', {
    payload: JSON.stringify(payload),
  });
  return { shareId: result.share_id, url: result.url };
}

/**
 * Fetch a shared match from Supabase by shareId.
 * Uses the public anon key — no auth required.
 */
export async function fetchSharedMatch(shareId: string): Promise<SharePayload | null> {
  const result = await invoke<string | null>('fetch_from_cloud', { shareId });
  if (!result) return null;
  return JSON.parse(result) as SharePayload;
}
