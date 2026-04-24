// VSP — VolleyScoutPro proprietary match format (v1)
//
// Structure:
//   { version, format, exportedAt, match, events }
//
// The format is plain JSON so it is human-readable and future-proof.
// Import reconstructs the full event log, which replays to produce match state.

import { invoke } from '@tauri-apps/api/core';

export interface VspFile {
  version: 1;
  format: 'vsp';
  exportedAt: string;
  match: Record<string, unknown> | null;
  events: unknown[];
}

// ─────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────

/** Opens a native save-file dialog and writes the .vsp file. Returns the saved path or null if cancelled. */
export async function exportVsp(matchId: string): Promise<string | null> {
  return invoke<string | null>('export_vsp', { matchId });
}

// ─────────────────────────────────────────────
// IMPORT
// ─────────────────────────────────────────────

/** Opens a native open-file dialog and reads a .vsp file. Returns the parsed content or null if cancelled. */
export async function importVsp(): Promise<VspFile | null> {
  const raw = await invoke<string | null>('import_vsp');
  if (!raw) return null;
  const parsed = JSON.parse(raw) as VspFile;
  if (parsed.version !== 1 || parsed.format !== 'vsp') {
    throw new Error('File .vsp non riconosciuto o versione non supportata');
  }
  return parsed;
}
