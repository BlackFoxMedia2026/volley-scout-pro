import { useState, useCallback } from 'react';

interface NavState<V extends string> {
  view: V;
  matchId: string | null;
}

interface NavActions<V extends string> {
  navigate: (view: V, matchId?: string) => void;
  back: () => void;
}

export function useNav<V extends string = 'home'>(): NavState<V> & NavActions<V> {
  const [history, setHistory] = useState<NavState<V>[]>([{ view: 'home' as V, matchId: null }]);
  const current = history[history.length - 1];

  const navigate = useCallback((view: V, matchId?: string) => {
    setHistory(prev => [...prev, { view, matchId: matchId ?? null }]);
  }, []);

  const back = useCallback(() => {
    setHistory(prev => prev.length > 1 ? prev.slice(0, -1) : prev);
  }, []);

  return { ...current, navigate, back };
}
