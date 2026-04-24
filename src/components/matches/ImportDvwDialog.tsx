import { useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { parseDvw, dvwToEvents } from '@/lib/dvw/dvwParser';
import { useAppStore } from '@/stores/appStore';
import type { DvwMatch } from '@/lib/dvw/dvwParser';

interface Props {
  onImported: (matchId: string) => void;
  onCancel: () => void;
}

type Step = 'file' | 'map_players' | 'preview' | 'importing';

export function ImportDvwDialog({ onImported, onCancel }: Props) {
  const { orgId, seasonId, userId } = useAppStore();
  const [step, setStep] = useState<Step>('file');
  const [dvw, setDvw] = useState<DvwMatch | null>(null);
  const [error, setError] = useState('');
  const [_warnings, setWarnings] = useState<string[]>([]);
  const [_skipped, setSkipped] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseDvw(ev.target?.result as string);
        setDvw(parsed);
        setStep('preview');
        setError('');
      } catch (err) {
        setError(`Errore nel file DVW: ${String(err)}`);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleImport = async () => {
    if (!dvw || !orgId || !seasonId || !userId) return;
    setStep('importing');

    try {
      // 1. Create teams if needed
      const homeTeam = await invoke<{ id: string }>('create_team', {
        req: { org_id: orgId, name: dvw.homeTeam, is_own_team: false },
      }).catch(() => invoke<{ id: string }>('create_team', {
        req: { org_id: orgId, name: dvw.homeTeam, short_name: dvw.homeTeam.slice(0, 3), is_own_team: false },
      }));

      const awayTeam = await invoke<{ id: string }>('create_team', {
        req: { org_id: orgId, name: dvw.awayTeam, is_own_team: false },
      }).catch(() => invoke<{ id: string }>('create_team', {
        req: { org_id: orgId, name: dvw.awayTeam, short_name: dvw.awayTeam.slice(0, 3), is_own_team: false },
      }));

      // 2. Create players and build maps
      const homeMap = new Map<number, string>();
      const awayMap = new Map<number, string>();

      for (const p of dvw.homePlayers) {
        const player = await invoke<{ id: string }>('create_player', {
          req: {
            org_id: orgId,
            first_name: p.name.split(' ').slice(1).join(' ') || p.name,
            last_name: p.name.split(' ')[0] ?? p.name,
            number: p.number,
            role: mapDvwRole(p.role),
            is_libero: p.role === 'L',
          },
        });
        homeMap.set(p.number, player.id);
      }

      for (const p of dvw.awayPlayers) {
        const player = await invoke<{ id: string }>('create_player', {
          req: {
            org_id: orgId,
            first_name: p.name.split(' ').slice(1).join(' ') || p.name,
            last_name: p.name.split(' ')[0] ?? p.name,
            number: p.number,
            role: mapDvwRole(p.role),
            is_libero: p.role === 'L',
          },
        });
        awayMap.set(p.number, player.id);
      }

      // 3. Create match
      const match = await invoke<{ id: string }>('create_match', {
        req: {
          org_id: orgId,
          season_id: seasonId,
          home_team_id: homeTeam.id,
          away_team_id: awayTeam.id,
          date: dvw.date || new Date().toISOString(),
          scouted_team: 'both',
          created_by: userId,
        },
      });

      // 4. Convert DVW events and append them all
      const { events, skippedCodes, warnings: ws } = dvwToEvents(dvw, {
        matchId: match.id,
        actorUserId: userId,
        homePlayerIdMap: homeMap,
        awayPlayerIdMap: awayMap,
      });

      setSkipped(skippedCodes);
      setWarnings(ws);

      // Append events in batches (avoid overwhelming IPC)
      for (const ev of events) {
        await invoke('append_event', {
          req: {
            match_id: ev.matchId,
            timestamp_ms: ev.timestampMs,
            video_ts_ms: ev.videoTsMs ?? null,
            type: ev.type,
            actor_user_id: ev.actorUserId,
            player_id: ev.playerId ?? null,
            team_side: ev.teamSide ?? null,
            raw_code: ev.rawCode ?? null,
            skill: ev.payload.skill ?? null,
            skill_type: ev.payload.skillType ?? null,
            quality: ev.payload.quality ?? null,
            combination: ev.payload.combination ?? null,
            zone_from: ev.payload.zoneFrom ?? null,
            zone_to: ev.payload.zoneTo ?? null,
            zone_to_sub: null,
            end_zone_plus: null,
            payload: JSON.stringify(ev.payload),
          },
        });
      }

      onImported(match.id);
    } catch (err) {
      setError(`Errore durante l'importazione: ${String(err)}`);
      setStep('preview');
    }
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog">
        <h2 className="dialog__title">Importa file DataVolley (.dvw)</h2>

        {step === 'file' && (
          <>
            <p className="text-muted">Seleziona un file .dvw esportato da DataVolley 4.</p>
            <input
              ref={fileRef}
              type="file"
              accept=".dvw,.dvs,.xml"
              onChange={handleFileLoad}
              style={{ display: 'none' }}
            />
            {error && <p className="form-error">{error}</p>}
            <div className="dialog__actions">
              <button className="btn btn--ghost" onClick={onCancel}>Annulla</button>
              <button className="btn btn--primary" onClick={() => fileRef.current?.click()}>
                Scegli file…
              </button>
            </div>
          </>
        )}

        {step === 'preview' && dvw && (
          <>
            <div className="dvw-preview">
              <div className="dvw-preview__teams">
                <span>{dvw.homeTeam}</span>
                <span className="vs-label">vs</span>
                <span>{dvw.awayTeam}</span>
              </div>
              <dl className="dvw-preview__meta">
                <dt>Data</dt><dd>{dvw.date || '—'}</dd>
                <dt>Torneo</dt><dd>{dvw.tournament || '—'}</dd>
                <dt>Set</dt><dd>{dvw.sets.length}</dd>
                <dt>Azioni (home)</dt><dd>{dvw.homePlayers.length} giocatori</dd>
                <dt>Azioni (ospiti)</dt><dd>{dvw.awayPlayers.length} giocatori</dd>
                <dt>Totale azioni</dt>
                <dd>{dvw.sets.reduce((acc, s) => acc + s.points.length, 0)}</dd>
              </dl>
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="dialog__actions">
              <button className="btn btn--ghost" onClick={onCancel}>Annulla</button>
              <button className="btn btn--primary" onClick={handleImport}>
                Importa partita
              </button>
            </div>
          </>
        )}

        {step === 'importing' && (
          <div className="dvw-importing">
            <div className="dvw-importing__spinner" />
            <p>Importazione in corso… può richiedere qualche secondo.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function mapDvwRole(dvwRole: string): string {
  switch (dvwRole.toUpperCase()) {
    case 'S':  return 'S';   // setter
    case 'OH': return 'OH';
    case 'OP': return 'OP';
    case 'MB': return 'MB';
    case 'L':  return 'L';   // libero
    case 'DS': return 'DS';
    default:   return 'OH';
  }
}
