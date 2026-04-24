// Report export — HTML (stampabile) + CSV (Excel)
//
// Both formats are generated in pure TypeScript from MatchStats + metadata.
// Saving uses a Rust save-file dialog command (save_file).

import { invoke } from '@tauri-apps/api/core';
import type { MatchStats, SkillStats } from '@/lib/analytics/stats';
import type { Skill } from '@/types/dv4';

// ─────────────────────────────────────────────
// SAVE HELPER (Rust: save_file)
// ─────────────────────────────────────────────

export async function saveFile(
  content: string,
  defaultName: string,
  filterExt: string,
  filterLabel: string,
): Promise<string | null> {
  return invoke<string | null>('save_file', {
    content,
    defaultName,
    filterExt,
    filterLabel,
  });
}

// ─────────────────────────────────────────────
// CSV
// ─────────────────────────────────────────────

const SKILL_LABELS: Record<Skill, string> = {
  S: 'Battuta',
  R: 'Ricezione',
  A: 'Attacco',
  B: 'Muro',
  D: 'Difesa',
  E: 'Alzata',
  F: 'Freeball',
};

function skillRow(label: string, st: SkillStats): string[] {
  return [
    label,
    String(st.total),
    String(st.excellent),
    String(st.positive),
    String(st.ok),
    String(st.negative),
    String(st.poor),
    String(st.error),
    `${st.positivePercent}%`,
    `${st.efficiency}%`,
    st.weightedRating.toFixed(2),
  ];
}

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(...cells: string[]): string {
  return cells.map(csvEscape).join(',');
}

export function buildCsv(
  stats: MatchStats,
  homeTeamName: string,
  awayTeamName: string,
  matchDate: string,
): string {
  const HEADER = [
    'Skill', 'Totale', 'Eccellente (#)', 'Positivo (+)', 'OK (!)',
    'Negativo (-)', 'Scarso (/)', 'Errore (=)',
    '% Positivo', '% Efficienza', 'Rating ponderato',
  ];

  const lines: string[] = [
    row('VolleyScoutPro — Report statistico'),
    row(`Data: ${matchDate}`, `${homeTeamName} vs ${awayTeamName}`),
    '',
    row(`=== ${homeTeamName} ===`),
    row(...HEADER),
  ];

  for (const [key, label] of Object.entries(SKILL_LABELS) as [Skill, string][]) {
    const st = stats.home.bySkill[key];
    if (st && st.total > 0) lines.push(row(...skillRow(label, st)));
  }

  lines.push('', row(`=== ${awayTeamName} ===`), row(...HEADER));
  for (const [key, label] of Object.entries(SKILL_LABELS) as [Skill, string][]) {
    const st = stats.away.bySkill[key];
    if (st && st.total > 0) lines.push(row(...skillRow(label, st)));
  }

  return lines.join('\r\n');
}

// ─────────────────────────────────────────────
// HTML
// ─────────────────────────────────────────────

function htmlSkillTable(teamName: string, stats: MatchStats['home']): string {
  const rows = (Object.entries(SKILL_LABELS) as [Skill, string][])
    .map(([key, label]) => {
      const st = stats.bySkill[key];
      if (!st || st.total === 0) return '';
      return `
        <tr>
          <td>${label}</td>
          <td>${st.total}</td>
          <td class="q-excellent">${st.excellent}</td>
          <td class="q-positive">${st.positive}</td>
          <td>${st.ok}</td>
          <td>${st.negative}</td>
          <td class="q-poor">${st.poor}</td>
          <td class="q-error">${st.error}</td>
          <td>${st.positivePercent}%</td>
          <td class="${st.efficiency >= 0 ? 'eff-pos' : 'eff-neg'}">${st.efficiency}%</td>
        </tr>`;
    })
    .filter(Boolean)
    .join('');

  return `
    <section class="team-section">
      <h2>${teamName}</h2>
      <table>
        <thead>
          <tr>
            <th>Skill</th><th>Tot</th>
            <th>#</th><th>+</th><th>!</th><th>-</th><th>/</th><th>=</th>
            <th>% Pos</th><th>% Eff</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

export function buildHtml(
  stats: MatchStats,
  homeTeamName: string,
  awayTeamName: string,
  matchDate: string,
): string {
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <title>Report — ${homeTeamName} vs ${awayTeamName}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1a1a2e; padding: 24px; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { color: #555; margin-bottom: 24px; }
    .team-section { margin-bottom: 32px; }
    h2 { font-size: 16px; margin-bottom: 8px; border-bottom: 2px solid #e63946; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: right; padding: 5px 8px; border-bottom: 1px solid #eee; }
    th:first-child, td:first-child { text-align: left; }
    thead th { background: #1a1a2e; color: #fff; font-weight: 600; }
    tbody tr:nth-child(even) { background: #f5f5f5; }
    .q-excellent { color: #2a9d8f; font-weight: 700; }
    .q-positive  { color: #457b9d; }
    .q-poor      { color: #e76f51; }
    .q-error     { color: #e63946; font-weight: 700; }
    .eff-pos { color: #2a9d8f; font-weight: 700; }
    .eff-neg { color: #e63946; font-weight: 700; }
    .footer { margin-top: 32px; font-size: 11px; color: #999; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <h1>Report statistico</h1>
  <p class="meta">${homeTeamName} vs ${awayTeamName} — ${matchDate}</p>
  ${htmlSkillTable(homeTeamName, stats.home)}
  ${htmlSkillTable(awayTeamName, stats.away)}
  <button class="no-print" onclick="window.print()" style="margin-top:16px;padding:8px 16px;cursor:pointer;">
    Stampa / Salva PDF
  </button>
  <p class="footer">Generato da VolleyScoutPro — ${new Date().toLocaleString('it-IT')}</p>
</body>
</html>`;
}

// ─────────────────────────────────────────────
// CONVENIENCE WRAPPERS
// ─────────────────────────────────────────────

export async function exportHtmlReport(
  stats: MatchStats,
  homeTeamName: string,
  awayTeamName: string,
  matchDate: string,
): Promise<string | null> {
  const html = buildHtml(stats, homeTeamName, awayTeamName, matchDate);
  const name = `report-${homeTeamName.slice(0, 6)}-${awayTeamName.slice(0, 6)}.html`;
  return saveFile(html, name, 'html', 'HTML Report');
}

export async function exportCsvReport(
  stats: MatchStats,
  homeTeamName: string,
  awayTeamName: string,
  matchDate: string,
): Promise<string | null> {
  const csv = buildCsv(stats, homeTeamName, awayTeamName, matchDate);
  const name = `stats-${homeTeamName.slice(0, 6)}-${awayTeamName.slice(0, 6)}.csv`;
  return saveFile(csv, name, 'csv', 'CSV per Excel');
}
