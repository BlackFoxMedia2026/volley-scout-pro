import type { SkillStats } from '@/lib/analytics/stats';

// Compact horizontal bar showing quality distribution for a single skill.
// Used inline in the scouting view as a live indicator.

interface Props {
  label: string;
  stats: SkillStats;
  compact?: boolean;
}

export function StatsBar({ label, stats, compact = false }: Props) {
  if (stats.total === 0) return null;

  const segments = [
    { key: 'excellent', value: stats.excellent, cls: 'seg--excellent' },
    { key: 'positive',  value: stats.positive,  cls: 'seg--positive' },
    { key: 'ok',        value: stats.ok,         cls: 'seg--ok' },
    { key: 'negative',  value: stats.negative,   cls: 'seg--negative' },
    { key: 'poor',      value: stats.poor,        cls: 'seg--poor' },
    { key: 'error',     value: stats.error,       cls: 'seg--error' },
  ];

  return (
    <div className={`stats-bar ${compact ? 'stats-bar--compact' : ''}`}>
      <div className="stats-bar__label">{label}</div>
      <div className="stats-bar__track" title={`n=${stats.total} eff=${stats.efficiency}%`}>
        {segments.map(({ key, value, cls }) =>
          value > 0 ? (
            <div
              key={key}
              className={`stats-bar__seg ${cls}`}
              style={{ width: `${(value / stats.total) * 100}%` }}
              title={`${key}: ${value}`}
            />
          ) : null,
        )}
      </div>
      {!compact && (
        <div className="stats-bar__meta">
          <span className="stats-bar__eff" title="Efficienza">
            {stats.efficiency > 0 ? '+' : ''}{stats.efficiency}%
          </span>
          <span className="stats-bar__pos" title="Positività">
            {stats.positivePercent}% pos
          </span>
          <span className="stats-bar__total">n={stats.total}</span>
        </div>
      )}
    </div>
  );
}
