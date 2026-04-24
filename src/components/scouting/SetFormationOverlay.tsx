import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FormationGrid } from '@/components/scouting/FormationGrid';
import type { FormationSnapshot } from '@/lib/formation/formationEngine';
import type { Player } from '@/types/match';

interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  number: number;
  role: string;
  is_libero: number;
}

interface Props {
  matchId: string;
  setNumber: number;
  orgId: string;
  userId: string;
  onDone: () => void;
}

export function SetFormationOverlay({ matchId, setNumber, orgId, userId, onDone }: Props) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [step, setStep] = useState<'home' | 'away'>('home');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    invoke<PlayerRow[]>('get_players', { orgId, teamId: null })
      .then(rows => {
        setPlayers(rows.map(r => ({
          id: r.id,
          firstName: r.first_name,
          lastName: r.last_name,
          number: r.number,
          role: r.role as Player['role'],
          isLibero: r.is_libero === 1,
        })));
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [orgId]);

  const submitFormation = async (teamSide: 'home' | 'away', formation: FormationSnapshot) => {
    await invoke('append_event', {
      req: {
        matchId,
        setId: null,
        rallyId: null,
        timestampMs: Date.now(),
        videoTsMs: null,
        type: 'formation_enter',
        actorUserId: userId,
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
        payload: JSON.stringify({ formation }),
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
      onDone();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="scouting-overlay">
      <div className="set-formation-overlay">
        <div className="set-formation-overlay__header">
          <h2>Formazione Set {setNumber}</h2>
          <div className="set-formation-overlay__steps">
            <span className={step === 'home' ? 'active' : 'done'}>1. Casa</span>
            <span>→</span>
            <span className={step === 'away' ? 'active' : step === 'home' ? '' : 'done'}>2. Ospiti</span>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={onDone}>Salta</button>
        </div>

        <div className="set-formation-overlay__body">
          {loading && <div className="scouting-loading">Caricamento giocatori…</div>}
          {error && <div className="form-error" style={{ padding: '.5rem' }}>{error}</div>}
          {!loading && step === 'home' && (
            <FormationGrid
              teamSide="home"
              players={players}
              onConfirm={handleHomeConfirm}
              onCancel={onDone}
            />
          )}
          {!loading && step === 'away' && (
            <FormationGrid
              teamSide="away"
              players={players}
              onConfirm={handleAwayConfirm}
              onCancel={onDone}
            />
          )}
        </div>
      </div>
    </div>
  );
}
