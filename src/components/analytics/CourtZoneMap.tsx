import type { ZoneDistribution } from '@/lib/analytics/stats';

interface Props {
  distributions: ZoneDistribution[];
  title?: string;
  showNet?: boolean;
}

const ZONE_GRID: Record<number, { col: number; row: number }> = {
  1: { col: 0, row: 2 }, 2: { col: 1, row: 2 }, 3: { col: 2, row: 2 },
  4: { col: 0, row: 1 }, 5: { col: 1, row: 1 }, 6: { col: 2, row: 1 },
  7: { col: 0, row: 0 }, 8: { col: 1, row: 0 }, 9: { col: 2, row: 0 },
};

// DV4 zone ordering for 3x3 grid render (top row first)
const ZONE_ORDER = [7, 8, 9, 4, 5, 6, 1, 2, 3] as const;

export function CourtZoneMap({ distributions, title, showNet = true }: Props) {
  const maxCount = Math.max(...distributions.map(d => d.count), 1);
  const zoneMap = new Map<number, ZoneDistribution>(distributions.map(d => [d.zone, d]));
  const totalActions = distributions.reduce((s, d) => s + d.count, 0);

  return (
    <div className="court-zone-map">
      {title && <div className="court-zone-map__title">{title}</div>}
      <div className="court-zone-map__grid">
        {/* Net line between rows 1 and 2 (after top row in attack direction) */}
        {showNet && <div className="court-zone-map__net" />}
        {ZONE_ORDER.map(zone => {
          const d = zoneMap.get(zone);
          const intensity = d ? d.count / maxCount : 0;
          const { col, row } = ZONE_GRID[zone];
          const eff = d && d.count > 0
            ? Math.round(((d.excellent - d.error) / d.count) * 100)
            : null;
          const pct = d && d.count > 0 && totalActions > 0
            ? Math.round((d.count / totalActions) * 100)
            : null;

          return (
            <div
              key={zone}
              className="zone-cell"
              style={{
                gridColumn: col + 1,
                gridRow: row + 1,
                background: d ? heatColor(intensity, d.excellent, d.error, d.count) : undefined,
              }}
              title={d ? `Z${zone}: ${d.count} azioni · ${d.excellent}# · ${d.error}= · Eff ${eff != null ? (eff > 0 ? '+' : '') + eff + '%' : 'n/d'}` : `Z${zone}: nessuna azione`}
            >
              <span className="zone-cell__num">{zone}</span>
              {d && d.count > 0 && (
                <>
                  <span className="zone-cell__count">{d.count}</span>
                  {pct != null && <span className="zone-cell__pct">{pct}%</span>}
                  {eff != null && (
                    <span className={`zone-cell__eff ${eff >= 20 ? 'zone-eff--good' : eff >= 0 ? '' : 'zone-eff--bad'}`}>
                      {eff > 0 ? '+' : ''}{eff}%
                    </span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="court-zone-map__legend">
        <span className="legend-dot legend-dot--ace" /> alta eff&nbsp;
        <span className="legend-dot legend-dot--error" /> bassa eff&nbsp;
        <span style={{ color: 'var(--text-muted)', fontSize: '.65rem' }}>tot: {totalActions}</span>
      </div>
    </div>
  );
}

function heatColor(intensity: number, excellent: number, error: number, total: number): string {
  if (total === 0) return 'transparent';
  const eff = (excellent - error) / total;  // -1 to +1
  const alpha = 0.15 + intensity * 0.65;
  // Positive eff → green, negative → red, neutral → blue-grey
  const r = eff < 0 ? Math.round(180 + (-eff) * 75) : Math.round(30 + eff * 30);
  const g = eff > 0 ? Math.round(160 + eff * 80) : Math.round(60 - (-eff) * 30);
  const b = Math.round(120 - intensity * 60);
  return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
}
