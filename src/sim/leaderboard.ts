export interface LeaderboardEntry {
  name: string;
  score: number;
  nights_won: number;
  achieved_at: string;
  seed: number;
}

export interface LeaderboardFile {
  entries: LeaderboardEntry[];
}

export const LEADERBOARD_MAX_ENTRIES = 10;

// 3..12 characters: ASCII [A-Za-z0-9_] plus Unicode letters (Vietnamese accented letters supported)
const NAME_REGEX = /^[\p{L}0-9_]{3,12}$/u;

export function validateLeaderboardName(raw: string): { valid: boolean; reason?: string } {
  const trimmed = raw.trim().normalize('NFC');
  if (trimmed.length < 3 || trimmed.length > 12) {
    return { valid: false, reason: 'Tên phải dài từ 3 đến 12 ký tự.' };
  }
  if (!NAME_REGEX.test(trimmed)) {
    return {
      valid: false,
      reason: 'Chỉ dùng chữ cái (hỗ trợ tiếng Việt có dấu), chữ số và dấu gạch dưới (_).',
    };
  }
  return { valid: true };
}

/** Formats a Date as ISO 8601 with explicit local timezone offset (e.g. 2026-11-20T22:30:00+07:00). */
export function formatIsoWithTimezone(date: Date = new Date()): string {
  const pad = (n: number): string => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const hh = pad(offsetMin / 60);
  const mm = pad(offsetMin % 60);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${hh}:${mm}`
  );
}

/** Sorts entries by score DESC; tie-break by earlier achieved_at ASC. Truncates to Top 10. */
export function sortAndTrimLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ta = Date.parse(a.achieved_at);
      const tb = Date.parse(b.achieved_at);
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) {
        return ta - tb;
      }
      return a.achieved_at.localeCompare(b.achieved_at);
    })
    .slice(0, LEADERBOARD_MAX_ENTRIES);
}

export function addLeaderboardEntry(
  existing: LeaderboardEntry[],
  candidate: LeaderboardEntry,
): LeaderboardEntry[] {
  const check = validateLeaderboardName(candidate.name);
  if (!check.valid) {
    throw new Error(check.reason ?? 'Invalid leaderboard name');
  }
  const normalized: LeaderboardEntry = {
    name: candidate.name.trim().normalize('NFC'),
    score: Math.max(0, Math.floor(candidate.score)),
    nights_won: Math.max(0, Math.min(3, Math.floor(candidate.nights_won))),
    achieved_at: candidate.achieved_at || formatIsoWithTimezone(),
    seed: Math.floor(candidate.seed),
  };
  return sortAndTrimLeaderboard([...existing, normalized]);
}
