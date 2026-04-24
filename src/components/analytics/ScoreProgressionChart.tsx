import { useMemo } from 'react';
import { assignEventSets, computeScoreProgression } from '@/lib/analytics/stats';
import type { MatchEvent } from '@/types/match';

interface Props {
  events: MatchEvent[];
  filterSet?: number | null;
}

const W = 260, H = 72;
const PAD_X = 6, PAD_Y = 6;
const INNER_W = W - PAD_X * 2;
const INNER_H = H - PAD_Y * 2;

export function ScoreProgressionChart({ events, filterSet }: Props) {
  const points = useMemo(() => {
    const setIndex = filterSet ? assignEventSets(events) : undefined;
    return computeScoreProgression(events, setIndex, filterSet);
  }, [events, filterSet]);

  if (points.length < 2) return null;

  const diffs = points.map(p => p.diff);
  const maxAbs = Math.max(Math.abs(Math.min(...diffs)), Math.max(...diffs), 3);
  const midY = PAD_Y + INNER_H / 2;

  const toX = (i: number) => PAD_X + (i / (points.length - 1)) * INNER_W;
  const toY = (d: number) => midY - (d / maxAbs) * (INNER_H / 2);

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.diff).toFixed(1)}`).join(' ');
  const lastPt = points[points.length - 1];
  const lastX = toX(points.length - 1);
  const lastY = toY(lastPt.diff);

  const fillPath = `${pathD} L${lastX.toFixed(1)},${midY} L${PAD_X},${midY} Z`;

  return (
    <div className="score-chart">
      <div className="score-chart__header">
        <span className="score-chart__title">Andamento</span>
        <span className="score-chart__diff" style={{ color: lastPt.diff >= 0 ? 'var(--home)' : 'var(--away)' }}>
          {lastPt.diff > 0 ? `+${lastPt.diff}` : lastPt.diff}
        </span>
      </div>
      <div className="score-chart__wrap">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="score-chart__svg">
          {/* zero line */}
          <line x1={PAD_X} y1={midY} x2={W - PAD_X} y2={midY} stroke="var(--border)" strokeWidth="1" />
          {/* fill */}
          <path d={fillPath} fill={lastPt.diff >= 0 ? 'var(--home)' : 'var(--away)'} opacity="0.12" />
          {/* line */}
          <path d={pathD} fill="none" stroke="var(--home)" strokeWidth="1.5" strokeLinejoin="round" />
          {/* last point dot */}
          <circle cx={lastX} cy={lastY} r="3" fill={lastPt.team === 'home' ? 'var(--home)' : 'var(--away)'} />
        </svg>
        <div className="score-chart__y-labels">
          <span>+{maxAbs}</span>
          <span>0</span>
          <span>-{maxAbs}</span>
        </div>
      </div>
    </div>
  );
}
