import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FormationGrid } from '@/components/scouting/FormationGrid';
import { useAppStore } from '@/stores/appStore';
import type { FormationSnapshot } from '@/lib/formation/formationEngine';
import type { Player } from '@/types/match';

interface MatchMeta {
  id: string;
  home_team_id: string;
  away_team_id: string;
  org_id: string;
}

interface PlayerRow {
  id: string;
  org_id: string;
  first_name: string;
  last_name: string;
  number: number;
  role: 'S' | 'OH' | 'OP' | 'MB' | 'L' | 'DS';
  is_libero: number;
}

interface Props {
  matchId: string;
  onDone: (matchId: string) => void;
  onBack: () => void;
}

export function FormationSetupView({ matchId, onDone, onBack }: Props) {
  const { orgId, userId } = useAppStore();
  const [matchMeta, setMatchMeta] = useState<MatchMeta | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [step, setStep] = useState<'home' | 'away' | 'done'>('home');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [meta, rawPlayers] = await Promise.all([
          invoke<MatchMeta>('get_match', { id: matchId }),
          orgId ? invoke<PlayerRow[]>('get_players', { orgId, teamId: null }) : Promise.resolve([]),
        ]);
        setMatchMeta(meta);
        setPlayers((rawPlayers as PlayerRow[]).map(p => ({
          id: p.id,
          firstName: p.first_name,
          lastName: p.last_name,
          number: p.number,
          role: p.role as Player['role'],
          isLibero: p.is_libero === 1,
        })));
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [matchId, orgId]);

  const submitFormation = async (teamSide: 'home' | 'away', formation: FormationSnapshot) => {
    const payload = JSON.stringify({ formation });
    await invoke('append_event', {
      req: {
        matchId,
        setId: null,
        rallyId: null,
        timestampMs: Date.now(),
        videoTsMs: null,
        type: 'formation_enter',
        actorUserId: userId ?? 'user_local',
        playerId: null,
        teamSide,
        rawCode: null,
        skill: null,
        skillType: null,
        quality: null,
        combination: null,
        zoneFrom: null,
        zoneTo: null,
        zoneToSub: null,
        endZonePlus: null,
        payload,
        isValid: true,
      },
    });
  };

  const handleHomeConfirm = async (formation: FormationSnapshot) => {
    try {
      await submitFormation('home', formation);
      setStep('away');
    } catch (e) {
      setError(String(e));
    }
  };

  const handleAwayConfirm = async (formation: FormationSnapshot) => {
    try {
      await submitFormation('away', formation);
      onDone(matchId);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleSkip = () => {
    onDone(matchId);
  };

  if (loading) return <div className="scouting-loading">Caricamento…</div>;

  // Suppress unused warning — matchMeta loaded but only needed for context
  void matchMeta;

  return (
    <div className="formation-setup">
      <header className="formation-setup__header">
        <button className="btn btn--ghost btn--sm" onClick={onBack}>← Annulla</button>
        <div className="formation-setup__steps">
          <span className={`formation-setup__step ${step === 'home' ? 'formation-setup__step--active' : step === 'away' || step === 'done' ? 'formation-setup__step--done' : ''}`}>
            1. Formazione Casa
          </span>
          <span className="formation-setup__step-sep">→</span>
          <span className={`formation-setup__step ${step === 'away' ? 'formation-setup__step--active' : step === 'done' ? 'formation-setup__step--done' : ''}`}>
            2. Formazione Ospiti
          </span>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={handleSkip}>Salta →</button>
      </header>

      <div className="formation-setup__body">
        {error && <div className="form-error" style={{ padding: '1rem' }}>{error}</div>}

        {step === 'home' && (
          <FormationGrid
            teamSide="home"
            players={players}
            onConfirm={handleHomeConfirm}
            onCancel={handleSkip}
          />
        )}
        {step === 'away' && (
          <FormationGrid
            teamSide="away"
            players={players}
            onConfirm={handleAwayConfirm}
            onCancel={handleSkip}
          />
        )}
      </div>
    </div>
  );
}
