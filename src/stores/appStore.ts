import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';

// ─────────────────────────────────────────────
// GLOBAL APP STATE
// Persisted to SQLite app_state table on first bootstrap.
// ─────────────────────────────────────────────

interface AppState {
  orgId: string | null;
  seasonId: string | null;
  userId: string | null;
  isBootstrapped: boolean;
  isLoading: boolean;
}

interface AppActions {
  init: () => Promise<void>;
  bootstrap: (orgName: string, seasonName: string, userName: string) => Promise<void>;
}

export const useAppStore = create<AppState & AppActions>()(
  immer(set => ({
    orgId: null,
    seasonId: null,
    userId: null,
    isBootstrapped: false,
    isLoading: true,

    init: async () => {
      try {
        const [orgId, seasonId, userId] = await Promise.all([
          invoke<string | null>('get_app_state', { key: 'active_org_id' }),
          invoke<string | null>('get_app_state', { key: 'active_season_id' }),
          invoke<string | null>('get_app_state', { key: 'active_user_id' }),
        ]);
        set(s => {
          s.orgId = orgId;
          s.seasonId = seasonId;
          s.userId = userId;
          s.isBootstrapped = !!orgId;
          s.isLoading = false;
        });
      } catch {
        set(s => { s.isLoading = false; });
      }
    },

    bootstrap: async (orgName, seasonName, userName) => {
      const result = await invoke<{ org_id: string; season_id: string; user_id: string }>(
        'bootstrap',
        { req: { org_name: orgName, season_name: seasonName, user_name: userName } },
      );
      set(s => {
        s.orgId = result.org_id;
        s.seasonId = result.season_id;
        s.userId = result.user_id;
        s.isBootstrapped = true;
      });
    },
  })),
);
