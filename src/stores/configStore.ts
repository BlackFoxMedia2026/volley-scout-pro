import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';

// ─────────────────────────────────────────────
// TYPES (mirroring Rust structs)
// ─────────────────────────────────────────────

export interface AttackCombination {
  id: string;
  orgId: string;
  seasonId: string | null;
  code: string;
  description: string;
  ballType: string | null;
  attackerPosition: string | null;
  zoneFrom: number | null;
  useCones: number;
  trajectoryData: string | null;
  sortOrder: number;
  isActive: number;
}

export interface SetterCall {
  id: string;
  orgId: string;
  seasonId: string | null;
  code: string;
  description: string;
  movementData: string | null;
  setZoneData: string | null;
  colorHex: string;
  isActive: number;
}

export interface CodeShortcut {
  id: string;
  orgId: string;
  shortcut: string;
  expandsTo: string;
  description: string;
}

export interface CompoundCodeConfig {
  id: string;
  orgId: string;
  skillA: string;
  skillB: string;
  qualityMap: string; // JSON
  propagateType: number;
  propagateZones: number;
  isActive: number;
}

// ─────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────

interface ConfigState {
  orgId: string | null;
  seasonId: string | null;
  attackCombinations: AttackCombination[];
  setterCalls: SetterCall[];
  compoundConfig: CompoundCodeConfig[];
  shortcuts: CodeShortcut[];
  isLoaded: boolean;
  error: string | null;
}

interface ConfigActions {
  init: (orgId: string, seasonId?: string) => Promise<void>;
  upsertCombination: (combo: Omit<AttackCombination, 'id'> & { id?: string }) => Promise<void>;
  deleteCombination: (id: string) => Promise<void>;
  upsertSetterCall: (call: Omit<SetterCall, 'id'> & { id?: string }) => Promise<void>;
  upsertShortcut: (s: Omit<CodeShortcut, 'id'> & { id?: string }) => Promise<void>;
  deleteShortcut: (id: string) => Promise<void>;
  // Lookup helpers used by the parser
  combinationByCode: (code: string) => AttackCombination | undefined;
  setterCallByCode: (code: string) => SetterCall | undefined;
  qualityMapForPair: (skillA: string, skillB: string) => Record<string, string> | null;
  expandShortcut: (buffer: string) => string;
}

// Tauri returns snake_case; we map to camelCase manually
function mapCombo(r: Record<string, unknown>): AttackCombination {
  return {
    id: r.id as string,
    orgId: r.org_id as string,
    seasonId: r.season_id as string | null,
    code: r.code as string,
    description: r.description as string,
    ballType: r.ball_type as string | null,
    attackerPosition: r.attacker_position as string | null,
    zoneFrom: r.zone_from as number | null,
    useCones: r.use_cones as number,
    trajectoryData: r.trajectory_data as string | null,
    sortOrder: r.sort_order as number,
    isActive: r.is_active as number,
  };
}

function mapSetterCall(r: Record<string, unknown>): SetterCall {
  return {
    id: r.id as string,
    orgId: r.org_id as string,
    seasonId: r.season_id as string | null,
    code: r.code as string,
    description: r.description as string,
    movementData: r.movement_data as string | null,
    setZoneData: r.set_zone_data as string | null,
    colorHex: r.color_hex as string,
    isActive: r.is_active as number,
  };
}

function mapShortcut(r: Record<string, unknown>): CodeShortcut {
  return {
    id: r.id as string,
    orgId: r.org_id as string,
    shortcut: r.shortcut as string,
    expandsTo: r.expands_to as string,
    description: r.description as string,
  };
}

function mapCompound(r: Record<string, unknown>): CompoundCodeConfig {
  return {
    id: r.id as string,
    orgId: r.org_id as string,
    skillA: r.skill_a as string,
    skillB: r.skill_b as string,
    qualityMap: r.quality_map as string,
    propagateType: r.propagate_type as number,
    propagateZones: r.propagate_zones as number,
    isActive: r.is_active as number,
  };
}

export const useConfigStore = create<ConfigState & ConfigActions>()(
  immer((set, get) => ({
    orgId: null,
    seasonId: null,
    attackCombinations: [],
    setterCalls: [],
    compoundConfig: [],
    shortcuts: [],
    isLoaded: false,
    error: null,

    init: async (orgId, seasonId) => {
      try {
        const [combos, calls, compound, shortcuts] = await Promise.all([
          invoke<unknown[]>('get_attack_combinations', { orgId, seasonId: seasonId ?? null }),
          invoke<unknown[]>('get_setter_calls', { orgId, seasonId: seasonId ?? null }),
          invoke<unknown[]>('get_compound_config', { orgId }),
          invoke<unknown[]>('get_shortcuts', { orgId }),
        ]);
        set(s => {
          s.orgId = orgId;
          s.seasonId = seasonId ?? null;
          s.attackCombinations = (combos as Record<string, unknown>[]).map(mapCombo);
          s.setterCalls = (calls as Record<string, unknown>[]).map(mapSetterCall);
          s.compoundConfig = (compound as Record<string, unknown>[]).map(mapCompound);
          s.shortcuts = (shortcuts as Record<string, unknown>[]).map(mapShortcut);
          s.isLoaded = true;
          s.error = null;
        });
      } catch (err) {
        set(s => { s.error = String(err); });
      }
    },

    upsertCombination: async (combo) => {
      const { orgId } = get();
      if (!orgId) return;
      const req = {
        id: (combo as { id?: string }).id ?? null,
        org_id: orgId,
        season_id: combo.seasonId ?? null,
        code: combo.code,
        description: combo.description,
        ball_type: combo.ballType ?? null,
        attacker_position: combo.attackerPosition ?? null,
        zone_from: combo.zoneFrom ?? null,
        use_cones: combo.useCones ?? 0,
        trajectory_data: combo.trajectoryData ?? null,
        sort_order: combo.sortOrder ?? 0,
        is_active: combo.isActive ?? 1,
      };
      const raw = await invoke<Record<string, unknown>>('upsert_attack_combination', { req });
      const updated = mapCombo(raw);
      set(s => {
        const idx = s.attackCombinations.findIndex(c => c.id === updated.id);
        if (idx >= 0) s.attackCombinations[idx] = updated;
        else s.attackCombinations.push(updated);
      });
    },

    deleteCombination: async (id) => {
      await invoke('delete_attack_combination', { id });
      set(s => { s.attackCombinations = s.attackCombinations.filter(c => c.id !== id); });
    },

    upsertSetterCall: async (call) => {
      const { orgId } = get();
      if (!orgId) return;
      const raw = await invoke<Record<string, unknown>>('upsert_setter_call', { req: { ...call, org_id: orgId } });
      const updated = mapSetterCall(raw);
      set(s => {
        const idx = s.setterCalls.findIndex(c => c.id === updated.id);
        if (idx >= 0) s.setterCalls[idx] = updated;
        else s.setterCalls.push(updated);
      });
    },

    upsertShortcut: async (s) => {
      const { orgId } = get();
      if (!orgId) return;
      const raw = await invoke<Record<string, unknown>>('upsert_shortcut', {
        req: {
          id: s.id ?? null,
          org_id: orgId,
          shortcut: s.shortcut,
          expands_to: s.expandsTo,
          description: s.description,
        },
      });
      const updated = mapShortcut(raw);
      set(st => {
        const idx = st.shortcuts.findIndex(x => x.id === updated.id);
        if (idx >= 0) st.shortcuts[idx] = updated;
        else st.shortcuts.push(updated);
      });
    },

    deleteShortcut: async (id) => {
      await invoke('delete_shortcut', { id });
      set(s => { s.shortcuts = s.shortcuts.filter(x => x.id !== id); });
    },

    expandShortcut: (buffer) => {
      const match = get().shortcuts.find(s => s.shortcut === buffer);
      return match ? match.expandsTo : buffer;
    },

    combinationByCode: (code) => get().attackCombinations.find(c => c.code === code),
    setterCallByCode: (code) => get().setterCalls.find(c => c.code === code),
    qualityMapForPair: (skillA, skillB) => {
      const rule = get().compoundConfig.find(c => c.skillA === skillA && c.skillB === skillB);
      if (!rule) return null;
      try {
        return JSON.parse(rule.qualityMap) as Record<string, string>;
      } catch {
        return null;
      }
    },
  })),
);
