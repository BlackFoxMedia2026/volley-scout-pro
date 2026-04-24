import type { TimelineEvent } from '@/lib/analytics/stats';

interface Props {
  events: TimelineEvent[];
  maxPoints?: number;
  homeLabel?: string;
  awayLabel?: string;
}

const W = 280;
const TRACK_Y = 32;
const H = 68;
const PAD_X = 6;
const PLOT_W = W - PAD_X * 2;

const ICON: Record<string, string> = {
  timeout:      'TO',
  substitution: 'S',
  libero_swap:  'L',
  challenge:    'CH',
};

const COLOR: Record<string, string> = {
  timeout:      '#f59e0b',
  substitution: '#60a5fa',
  libero_swap:  '#a78bfa',
  challenge:    '#f87171',
};

export function SetTimeline({ events, maxPoints = 25, homeLabel = 'H', awayLabel = 'A' }: Props) {
  if (events.length === 0) {
    return (
      <div className="set-timeline set-timeline--empty">
        <span>Nessun evento di interruzione registrato</span>
      </div>
    );
  }

  // Derive true maxPoints from data
  const dataMax = events.length > 0
    ? Math.max(...events.map(e => e.scoreHome + e.scoreAway), maxPoints)
    : maxPoints;

  function xForPoint(idx: number): number {
    return PAD_X + (idx / Math.max(dataMax, 1)) * PLOT_W;
  }

  const homeEvents = events.filter(e => e.teamSide === 'home');
  const awayEvents = events.filter(e => e.teamSide === 'away');

  return (
    <div className="set-timeline">
      <svg viewBox={`0 0 ${W} ${H}`} className="set-timeline__svg" aria-label="Set timeline">
        {/* Team labels */}
        <text x={PAD_X} y={TRACK_Y - 14} className="tl-label">{homeLabel}</text>
        <text x={PAD_X} y={TRACK_Y + 28} className="tl-label tl-label--away">{awayLabel}</text>

        {/* Center track line */}
        <line
          x1={PAD_X} y1={TRACK_Y}
          x2={W - PAD_X} y2={TRACK_Y}
          className="tl-track"
        />

        {/* Score markers every 5 points */}
        {Array.from({ length: Math.floor(dataMax / 5) + 1 }, (_, i) => i * 5).map(score => {
          const x = xForPoint(score);
          return (
            <g key={score}>
              <line x1={x} y1={TRACK_Y - 3} x2={x} y2={TRACK_Y + 3} className="tl-tick" />
              <text x={x} y={TRACK_Y + 16} className="tl-score-label">{score}</text>
            </g>
          );
        })}

        {/* Home events (above the line) */}
        {homeEvents.map((ev, i) => {
          const x = xForPoint(ev.pointIndex);
          const color = COLOR[ev.type] ?? '#888';
          const label = ICON[ev.type] ?? '?';
          return (
            <g key={`h-${i}`}>
              <line x1={x} y1={TRACK_Y - 4} x2={x} y2={TRACK_Y - 14} stroke={color} strokeWidth={1.5} />
              <rect x={x - 7} y={TRACK_Y - 25} width={14} height={10} rx={2} fill={color} opacity={0.9} />
              <text x={x} y={TRACK_Y - 18} className="tl-icon">{label}</text>
              <title>{ev.type} — {ev.scoreHome}:{ev.scoreAway}</title>
            </g>
          );
        })}

        {/* Away events (below the line) */}
        {awayEvents.map((ev, i) => {
          const x = xForPoint(ev.pointIndex);
          const color = COLOR[ev.type] ?? '#888';
          const label = ICON[ev.type] ?? '?';
          return (
            <g key={`a-${i}`}>
              <line x1={x} y1={TRACK_Y + 4} x2={x} y2={TRACK_Y + 14} stroke={color} strokeWidth={1.5} />
              <rect x={x - 7} y={TRACK_Y + 15} width={14} height={10} rx={2} fill={color} opacity={0.9} />
              <text x={x} y={TRACK_Y + 22} className="tl-icon">{label}</text>
              <title>{ev.type} — {ev.scoreHome}:{ev.scoreAway}</title>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="set-timeline__legend">
        {Object.entries(ICON).map(([type, label]) => (
          <span key={type} className="tl-legend-item">
            <span className="tl-legend-dot" style={{ background: COLOR[type] }} />
            {label}={type === 'timeout' ? 'Timeout' : type === 'substitution' ? 'Sost' : type === 'libero_swap' ? 'Libero' : 'Chall'}
          </span>
        ))}
      </div>
    </div>
  );
}
