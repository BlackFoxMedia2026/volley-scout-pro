import { computeTeamStats, computeSetterCallStats, computeMaxRuns, computeSkillTypeStats, computeSetDurations, computeSetComparison, computeSideoutBySet, computeServeTargetStats, serveZoneDistribution, computeScoringRuns } from '@/lib/analytics/stats';
import type { MatchEvent, MatchState } from '@/types/match';
import type { PlayerInfo } from '@/stores/matchStore';
import { SKILL_LABELS } from '@/types/dv4';
import type { Skill } from '@/types/dv4';

interface ReportInput {
  matchState: MatchState;
  events: MatchEvent[];
  homeTeamName: string;
  awayTeamName: string;
  date: string;
  playersById: Map<string, PlayerInfo>;
  competition?: string;
  matchPhase?: string;
  venue?: string;
}

const SKILLS: Skill[] = ['S', 'R', 'A', 'B', 'D'];

const SKILL_TYPE_LABELS: Record<string, Record<string, string>> = {
  S: { H: 'Float', M: 'Topspin', Q: 'Semi-jump', T: 'Tensor', U: 'Jump float', N: 'Other', O: 'Underhand' },
  R: { H: 'Overhand', O: 'One-arm', P: 'Platform' },
  A: { H: 'Line', P: 'Pipe', T: 'Tip', S: 'Spike', B: 'Back', C: 'Cut', E: 'Shoot', O: 'Other' },
  B: { '1': '1-blocker', '2': '2-blockers', '3': '3-blockers', C: 'Cover', P: 'Partial' },
  D: { H: 'Overhand', P: 'Platform', T: 'Tip', C: 'Cover', O: 'Other' },
};

function eff(n: number): string {
  return `${n > 0 ? '+' : ''}${n}%`;
}

function effColor(n: number): string {
  if (n >= 30) return '#22c55e';
  if (n >= 0)  return '#fbbf24';
  return '#f87171';
}

export function generateMatchReport(input: ReportInput): string {
  const { matchState, events, homeTeamName, awayTeamName, date, playersById, competition, matchPhase, venue } = input;

  const homeStats = computeTeamStats(events, 'home');
  const awayStats = computeTeamStats(events, 'away');
  const runs = computeMaxRuns(events);
  const scoringRuns = computeScoringRuns(events, 3);
  const setDurations = computeSetDurations(events);
  const totalSets = matchState.currentSet;
  const homeSetComparison = totalSets > 1 ? computeSetComparison(events, 'home', totalSets) : [];
  const awaySetComparison = totalSets > 1 ? computeSetComparison(events, 'away', totalSets) : [];

  const fmtDate = new Date(date).toLocaleDateString('it-IT', { dateStyle: 'long' });
  const setScoresHtml = matchState.setCores.map((s, i) =>
    `<span class="set-chip">${i + 1}: ${s.home}-${s.away}</span>`
  ).join('');

  function comparisonTableHtml(): string {
    const rows = SKILLS.map(skill => {
      const h = homeStats.bySkill[skill];
      const a = awayStats.bySkill[skill];
      if ((!h || h.total === 0) && (!a || a.total === 0)) return '';
      const hCell = h && h.total > 0
        ? `<td style="color:${effColor(h.efficiency)};font-weight:700;text-align:right">${eff(h.efficiency)}</td><td style="text-align:right;color:#94a3b8">${h.total}</td>`
        : '<td colspan="2" style="color:#94a3b8;text-align:right">—</td>';
      const aCell = a && a.total > 0
        ? `<td style="text-align:left;color:#94a3b8">${a.total}</td><td style="color:${effColor(a.efficiency)};font-weight:700">${eff(a.efficiency)}</td>`
        : '<td colspan="2" style="color:#94a3b8">—</td>';
      return `<tr>
        ${hCell}
        <td style="text-align:center;font-weight:600;font-size:.85rem;padding:.25rem .5rem;background:#f8fafc">${SKILL_LABELS[skill]}</td>
        ${aCell}
      </tr>`;
    }).join('');
    return `<table class="stats-table comparison-table" style="margin-bottom:1.5rem">
      <thead><tr>
        <th colspan="2" style="text-align:right;color:#3b82f6">${homeTeamName}</th>
        <th style="text-align:center">Skill</th>
        <th colspan="2" style="text-align:left;color:#f97316">${awayTeamName}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function statsTableHtml(side: 'home' | 'away'): string {
    const stats = side === 'home' ? homeStats : awayStats;
    const rows = SKILLS.map(skill => {
      const s = stats.bySkill[skill];
      if (!s || s.total === 0) return '';
      return `<tr>
        <td>${SKILL_LABELS[skill]}</td>
        <td>${s.total}</td>
        <td style="color: #22c55e">${s.excellent}</td>
        <td style="color: #86efac">${s.positive}</td>
        <td style="color: #fbbf24">${s.ok}</td>
        <td style="color: #f87171">${s.negative}</td>
        <td style="color: #dc2626">${s.error}</td>
        <td>${s.positivePercent}%</td>
        <td style="color: ${effColor(s.efficiency)}; font-weight: 700">${eff(s.efficiency)}</td>
      </tr>`;
    }).join('');
    return `<table class="stats-table">
      <thead><tr>
        <th>Skill</th><th>Tot</th><th>#</th><th>+</th><th>!</th><th>-</th><th>=</th><th>Pos%</th><th>Eff%</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function playerTableHtml(side: 'home' | 'away', skill: Skill): string {
    const stats = side === 'home' ? homeStats : awayStats;
    const rows = stats.byPlayer
      .map(p => ({ p, s: p.bySkill[skill] }))
      .filter(({ s }) => s && s.total > 0)
      .sort((a, b) => (b.s!.efficiency - a.s!.efficiency))
      .map(({ p, s }) => {
        const info = playersById.get(p.playerId);
        const name = info ? `#${info.number} ${info.lastName}` : p.playerId.slice(-6);
        return `<tr>
          <td>${name}</td>
          <td>${s!.total}</td>
          <td style="color: #22c55e">${s!.excellent}</td>
          <td style="color: #f87171">${s!.error}</td>
          <td>${s!.positivePercent}%</td>
          <td style="color: ${effColor(s!.efficiency)}; font-weight: 700">${eff(s!.efficiency)}</td>
        </tr>`;
      }).join('');
    if (!rows) return '';
    return `<table class="stats-table compact">
      <thead><tr><th>Giocatore</th><th>Tot</th><th>#</th><th>=</th><th>Pos%</th><th>Eff%</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function setterCallHtml(side: 'home' | 'away'): string {
    const calls = computeSetterCallStats(events, side);
    if (calls.length === 0) return '';
    const rows = calls.map(c => `<tr>
      <td><code>${c.code}</code></td>
      <td>${c.total}</td>
      <td style="color:#22c55e">${c.kills}</td>
      <td style="color:#dc2626">${c.errors}</td>
      <td style="color:${effColor(c.efficiency)};font-weight:700">${eff(c.efficiency)}</td>
    </tr>`).join('');
    return `<h5>Chiamate palleggiatore</h5>
    <table class="stats-table compact">
      <thead><tr><th>Cod</th><th>Tot</th><th>Kill</th><th>Err</th><th>Eff%</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function skillTypeHtml(side: 'home' | 'away', skill: Skill): string {
    const typeStats = computeSkillTypeStats(events, side, skill);
    if (typeStats.length === 0) return '';
    const labelMap = SKILL_TYPE_LABELS[skill] ?? {};
    const rows = typeStats.map(t => `<tr>
      <td><code>${t.type}</code> ${labelMap[t.type] ?? ''}</td>
      <td>${t.total}</td>
      <td style="color:#22c55e">${t.excellent}</td>
      <td style="color:#dc2626">${t.error}</td>
      <td style="color:${effColor(t.efficiency)};font-weight:700">${eff(t.efficiency)}</td>
    </tr>`).join('');
    return `<table class="stats-table compact">
      <thead><tr><th>Tipo</th><th>Tot</th><th>#</th><th>=</th><th>Eff%</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function sideoutBySetHtml(side: 'home' | 'away'): string {
    const rows = computeSideoutBySet(events, side);
    if (rows.length < 2) return '';
    const dataRows = rows.map(r => `<tr>
      <td>S${r.setNumber}</td>
      <td style="color:${effColor(r.sideoutPct - 50)};font-weight:700">${r.sideoutPct}%</td>
      <td style="color:${effColor(r.breakpointPct - 30)};font-weight:700">${r.breakpointPct}%</td>
      <td>${r.receiveRallies}</td>
      <td>${r.serveRallies}</td>
    </tr>`).join('');
    return `<h5>SO% / BP% per set</h5>
    <table class="stats-table compact">
      <thead><tr><th>Set</th><th>SO%</th><th>BP%</th><th>Ric n.</th><th>Serv n.</th></tr></thead>
      <tbody>${dataRows}</tbody>
    </table>`;
  }

  function serveTargetHtml(side: 'home' | 'away'): string {
    const receiver = side === 'home' ? 'away' : 'home';
    const rows = computeServeTargetStats(events, receiver);
    if (rows.length === 0) return '';
    const dataRows = rows.slice(0, 6).map(r => {
      const info = playersById.get(r.playerId);
      const name = info ? `#${info.number} ${info.lastName}` : r.playerId.slice(-6);
      return `<tr>
        <td>${name}</td>
        <td>${r.total}</td>
        <td>${r.positivePercent}%</td>
        <td style="color:${effColor(r.efficiency)};font-weight:700">${eff(r.efficiency)}</td>
      </tr>`;
    }).join('');
    return `<h5>Bersagli battuta (ricezione avversaria)</h5>
    <table class="stats-table compact">
      <thead><tr><th>Giocatore</th><th>Ric</th><th>Pos%</th><th>Eff%</th></tr></thead>
      <tbody>${dataRows}</tbody>
    </table>`;
  }

  function serveZoneHtml(side: 'home' | 'away'): string {
    const zones = serveZoneDistribution(events, side);
    if (zones.length === 0) return '';
    const total = zones.reduce((s, z) => s + z.count, 0);
    const dataRows = zones.map(z => {
      const pct = total > 0 ? Math.round((z.count / total) * 100) : 0;
      const eff2 = z.count > 0 ? Math.round(((z.excellent - z.error) / z.count) * 100) : 0;
      return `<tr>
        <td>Z${z.zone}</td>
        <td>${z.count}</td>
        <td>${pct}%</td>
        <td style="color:#22c55e">${z.excellent}</td>
        <td style="color:#f87171">${z.error}</td>
        <td style="color:${effColor(eff2)};font-weight:700">${eff(eff2)}</td>
      </tr>`;
    }).join('');
    return `<h5>Distribuzione zona battuta</h5>
    <table class="stats-table compact">
      <thead><tr><th>Zona</th><th>n.</th><th>%</th><th>Ace</th><th>Err</th><th>Eff%</th></tr></thead>
      <tbody>${dataRows}</tbody>
    </table>`;
  }

  function teamSection(side: 'home' | 'away', name: string): string {
    const color = side === 'home' ? '#3b82f6' : '#f97316';
    let html = `<section class="team-section">
      <h2 style="color:${color}">${name}</h2>
      ${statsTableHtml(side)}
      ${sideoutBySetHtml(side)}`;

    for (const skill of SKILLS) {
      const s = (side === 'home' ? homeStats : awayStats).bySkill[skill];
      if (!s || s.total === 0) continue;
      html += `<details open>
        <summary><strong>${SKILL_LABELS[skill]}</strong> (${s.total} azioni, Eff: ${eff(s.efficiency)})</summary>
        ${skillTypeHtml(side, skill)}
        ${skill === 'S' ? serveZoneHtml(side) : ''}
        ${skill === 'S' ? serveTargetHtml(side) : ''}
        ${skill === 'A' ? setterCallHtml(side) : ''}
        ${playerTableHtml(side, skill)}
      </details>`;
    }

    html += '</section>';
    return html;
  }

  const totalPts = matchState.setCores.reduce((s, c) => s + c.home + c.away, 0) +
    matchState.score.home + matchState.score.away;

  function fmtDuration(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}′${String(s).padStart(2, '0')}″`;
  }

  const setDurationHtml = setDurations.length > 0
    ? `<p class="run-info" style="margin-top:.25rem">
        Durata set: ${setDurations.map(d => `S${d.setNumber} ${fmtDuration(d.durationMs)} (${d.points} pt)`).join(' · ')}
       </p>`
    : '';

  function setComparisonHtml(rows: ReturnType<typeof computeSetComparison>, teamName: string): string {
    if (rows.length === 0) return '';
    const headers = Array.from({ length: totalSets }, (_, i) => `<th>S${i + 1}</th>`).join('');
    const dataRows = rows.map(row => {
      const cells = row.sets.map(s =>
        s === null
          ? '<td>—</td>'
          : `<td style="color:${effColor(s.efficiency)};font-weight:700">${eff(s.efficiency)}</td>`
      ).join('');
      return `<tr><td>${SKILL_LABELS[row.skill]}</td>${cells}</tr>`;
    }).join('');
    return `<details>
      <summary><strong>Confronto per set — ${teamName}</strong></summary>
      <table class="stats-table compact" style="margin-top:.5rem">
        <thead><tr><th>Skill</th>${headers}</tr></thead>
        <tbody>${dataRows}</tbody>
      </table>
    </details>`;
  }

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<title>Report — ${homeTeamName} vs ${awayTeamName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #1e293b; padding: 1.5rem 2rem; }
  h1 { font-size: 1.5rem; margin-bottom: .25rem; }
  h2 { font-size: 1.1rem; margin: 1.5rem 0 .5rem; padding-bottom: .25rem; border-bottom: 2px solid currentColor; }
  h5 { font-size: .8rem; margin: .75rem 0 .3rem; color: #64748b; text-transform: uppercase; letter-spacing: .06em; }
  .meta { color: #64748b; font-size: .88rem; margin-bottom: 1rem; }
  .set-chips { display: flex; gap: .5rem; flex-wrap: wrap; margin: .5rem 0; }
  .set-chip { background: #f1f5f9; border: 1px solid #e2e8f0; padding: .15rem .5rem; border-radius: .2rem; font-variant-numeric: tabular-nums; font-family: monospace; font-size: .85rem; }
  .score-summary { display: flex; gap: 2rem; align-items: baseline; margin: .5rem 0 1rem; }
  .score-main { font-size: 2.5rem; font-weight: 800; font-family: monospace; }
  .score-meta { color: #64748b; font-size: .82rem; }
  table.stats-table { width: 100%; border-collapse: collapse; margin-bottom: .75rem; }
  table.stats-table.compact { max-width: 480px; }
  table.comparison-table th, table.comparison-table td { background: transparent; }
  table.comparison-table { border: 1px solid #e2e8f0; border-radius: .25rem; overflow: hidden; }
  th { font-size: .72rem; color: #64748b; text-align: right; padding: .3rem .4rem; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
  th:first-child { text-align: left; }
  td { text-align: right; padding: .25rem .4rem; border-bottom: 1px solid #f1f5f9; font-variant-numeric: tabular-nums; }
  td:first-child { text-align: left; }
  tr:hover td { background: #f8fafc; }
  code { background: #f1f5f9; padding: .05rem .3rem; border-radius: .18rem; font-size: .88em; }
  details { margin: .75rem 0; }
  summary { cursor: pointer; padding: .3rem 0; font-size: .9rem; color: #334155; user-select: none; }
  summary:hover { color: #0f172a; }
  .team-section { margin-bottom: 2rem; page-break-inside: avoid; }
  .run-info { color: #64748b; font-size: .82rem; margin-top: .5rem; }
  @media print { details { display: block; } details summary { list-style: none; } }
  @page { margin: 1.5cm; }
</style>
</head>
<body>
<h1>${homeTeamName} vs ${awayTeamName}</h1>
<p class="meta">${competition ? `<strong>${competition}</strong>${matchPhase ? ` — ${matchPhase}` : ''} &nbsp;|&nbsp; ` : ''}${fmtDate}${venue ? ` &nbsp;|&nbsp; ${venue}` : ''}</p>
<div class="set-chips">${setScoresHtml}</div>
<div class="score-summary">
  <span class="score-main">${matchState.setsWon.home} – ${matchState.setsWon.away}</span>
  <span class="score-meta">${totalPts} punti totali</span>
</div>
${runs.homeMax > 0 || runs.awayMax > 0 ? `<p class="run-info">
  Massimo parziale — ${homeTeamName}: ${runs.homeMax}-0 &nbsp;|&nbsp; ${awayTeamName}: ${runs.awayMax}-0
</p>` : ''}
${setDurationHtml}

<h2 style="color:#475569;border-color:#e2e8f0">Confronto squadre</h2>
${comparisonTableHtml()}
${scoringRuns.length > 0 ? `<details><summary><strong>Parziali ≥3</strong> (${scoringRuns.length} runs)</summary>
<ul style="list-style:none;padding:.5rem 0;margin:0;display:flex;flex-wrap:wrap;gap:.4rem">
${scoringRuns.slice(0, 10).map(r => `<li style="background:${r.team === 'home' ? 'rgba(59,130,246,.08)' : 'rgba(249,115,22,.08)'};border-left:2px solid ${r.team === 'home' ? '#3b82f6' : '#f97316'};padding:.2rem .5rem;border-radius:0 .2rem .2rem 0;font-size:.78rem">
  <strong style="color:${r.team === 'home' ? '#3b82f6' : '#f97316'}">${r.length}-0</strong>
  <span style="color:#64748b"> S${r.setNumber} ${r.startScore.home}-${r.startScore.away}→${r.endScore.home}-${r.endScore.away}</span>
</li>`).join('')}
</ul>
</details>` : ''}

${setComparisonHtml(homeSetComparison, homeTeamName)}
${setComparisonHtml(awaySetComparison, awayTeamName)}

${teamSection('home', homeTeamName)}
${teamSection('away', awayTeamName)}

<footer style="margin-top:2rem;color:#94a3b8;font-size:.75rem;border-top:1px solid #e2e8f0;padding-top:.5rem">
  Generato da VolleyScoutPro · ${new Date().toLocaleString('it-IT')}
</footer>
</body>
</html>`;
}
