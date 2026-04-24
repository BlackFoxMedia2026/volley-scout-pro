import type { MatchEvent } from '@/types/match';
import type { PlayerInfo } from '@/stores/matchStore';

function escapeCsv(val: unknown): string {
  const s = val == null ? '' : String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function computeRallyNumbers(events: MatchEvent[]): Map<string, number> {
  const sorted = [...events]
    .filter(e => e.type !== 'undo' && !e.undoneBySeq)
    .sort((a, b) => a.sequence - b.sequence);

  const map = new Map<string, number>();
  let rally = 1;
  for (const e of sorted) {
    map.set(e.id, rally);
    if (e.type === 'point') rally++;
  }
  return map;
}

function computeSetNumbers(events: MatchEvent[]): Map<string, number> {
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  const map = new Map<string, number>();
  let currentSet = 1;
  for (const e of sorted) {
    if (e.type === 'set_start' && e.payload.setNumber) {
      currentSet = e.payload.setNumber as number;
    }
    map.set(e.id, currentSet);
  }
  return map;
}

export function eventsToCSV(
  events: MatchEvent[],
  playersById: Map<string, PlayerInfo>,
): string {
  const rallyNums = computeRallyNumbers(events);
  const setNums = computeSetNumbers(events);

  const headers = [
    'seq', 'set', 'rally', 'type', 'team', 'player_num', 'player_last_name',
    'skill', 'skill_type', 'quality',
    'zone_from', 'zone_to', 'zone_to_sub',
    'combination', 'ext_blockers', 'ext_type',
    'is_compound_pair', 'video_ts_ms', 'raw_code',
  ];

  const rows = events
    .filter(e => e.type !== 'undo' && !e.undoneBySeq)
    .sort((a, b) => a.sequence - b.sequence)
    .map(e => {
      const player = e.playerId ? playersById.get(e.playerId) : null;
      const cols = [
        e.sequence,
        setNums.get(e.id) ?? '',
        rallyNums.get(e.id) ?? '',
        e.type,
        e.teamSide ?? '',
        player?.number ?? '',
        player?.lastName ?? '',
        e.payload.skill ?? '',
        e.payload.skillType ?? '',
        e.payload.quality ?? '',
        e.payload.zoneFrom ?? '',
        e.payload.zoneTo ?? '',
        e.payload.zoneToSub ?? '',
        e.payload.combination ?? '',
        e.payload.extBlockers ?? '',
        e.payload.extType ?? '',
        e.payload.isCompoundPair ? '1' : '',
        e.videoTsMs ?? '',
        e.rawCode ?? '',
      ];
      return cols.map(escapeCsv).join(',');
    });

  return [headers.join(','), ...rows].join('\r\n');
}
