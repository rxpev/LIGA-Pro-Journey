// Read-only save audit. Requires Node 22.13+ (node:sqlite).
// Usage: node tools/audit-npc-rosters.cjs "C:/path/to/save_24.db"
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

if (!process.argv[2]) throw new Error('Pass the path to a save database.');
const db = new DatabaseSync(path.resolve(process.argv[2]), { readOnly: true });
const query = (sql, ...args) => db.prepare(sql).all(...args);
const iso = (value) => value == null ? null : new Date(value).toISOString();

// Keep all reads on the same SQLite snapshot if the game is open.
db.exec('BEGIN');
try {
  const profile = query('SELECT date FROM Profile LIMIT 1')[0];
  const teams = query(`SELECT t.id, t.name, c.code, COUNT(p.id) AS players,
    SUM(CASE WHEN p.starter = 1 THEN 1 ELSE 0 END) AS starters,
    SUM(CASE WHEN p.starter = 1 AND UPPER(p.role) IN ('SNIPER','AWPER')
      THEN 1 ELSE 0 END) AS startingSnipers
    FROM Team t JOIN Country c ON c.id = t.countryId
    LEFT JOIN Player p ON p.teamId = t.id GROUP BY t.id ORDER BY t.name`);
  const eligibleFreeAgents = query(`SELECT p.id, p.name, p.role, p.xp, c.code
    FROM Player p JOIN Country c ON c.id = p.countryId
    WHERE p.teamId IS NULL AND p.retiredAt IS NULL AND p.userControlled = 0
    AND (p.elo >= 2001 OR EXISTS (SELECT 1 FROM CareerStint s
      WHERE s.playerId = p.id AND s.teamId IS NOT NULL)) ORDER BY p.id`);
  const retirementDemand = query(`SELECT c.code,
    COUNT(*) AS competitiveRetirements,
    (SELECT COUNT(*) FROM Player r WHERE r.countryId = c.id AND r.isRegen = 1) AS regens
    FROM Player p JOIN Country c ON c.id = p.countryId
    WHERE p.retiredAt IS NOT NULL AND p.userControlled = 0
    AND EXISTS (SELECT 1 FROM CareerStint s WHERE s.playerId = p.id AND s.teamId IS NOT NULL)
    GROUP BY c.id ORDER BY competitiveRetirements DESC`);
  // Roles are current Player roles; CareerStint does not snapshot historical roles.
  const overlappingSniperStints = query(`SELECT t.name AS team, p.name AS playerA,
    p2.name AS playerB, MAX(s.startedAt,s2.startedAt) AS startedAt,
    MIN(COALESCE(s.endedAt,?),COALESCE(s2.endedAt,?)) AS endedAt
    FROM CareerStint s JOIN CareerStint s2
      ON s.teamId = s2.teamId AND s.playerId < s2.playerId
    JOIN Player p ON p.id = s.playerId JOIN Player p2 ON p2.id = s2.playerId
    JOIN Team t ON t.id = s.teamId
    WHERE s.starter = 1 AND s2.starter = 1
    AND UPPER(p.role) IN ('SNIPER','AWPER') AND UPPER(p2.role) IN ('SNIPER','AWPER')
    AND MAX(s.startedAt,s2.startedAt) < MIN(COALESCE(s.endedAt,?),COALESCE(s2.endedAt,?))
    ORDER BY startedAt`, profile.date, profile.date, profile.date, profile.date)
    .map((row) => ({ ...row, startedAt: iso(row.startedAt), endedAt: iso(row.endedAt) }));
  const examples = ['HEROIC', 'ReThink', 'Tricked', 'MANA', 'G2 Ares', 'Omega'].map((name) => {
    const team = teams.find((item) => item.name === name);
    if (!team) return { name, missing: true };
    const history = query(`SELECT p.name, c.code, p.role, s.starter, s.startedAt, s.endedAt
      FROM CareerStint s JOIN Player p ON p.id = s.playerId
      JOIN Country c ON c.id = p.countryId WHERE s.teamId = ? ORDER BY s.startedAt,s.id`, team.id)
      .map((row) => ({ ...row, startedAt: iso(row.startedAt), endedAt: iso(row.endedAt) }));
    return { ...team, history };
  });
  console.log(JSON.stringify({
    saveDateUtc: iso(profile.date),
    summary: {
      teams: teams.length,
      understaffed: teams.filter((t) => t.starters < 5).length,
      missingStarterSlots: teams.reduce((sum, t) => sum + Math.max(0, 5 - t.starters), 0),
      noStartingSniper: teams.filter((t) => t.startingSnipers === 0).length,
      multipleStartingSnipers: teams.filter((t) => t.startingSnipers > 1).length,
      eligibleFreeAgents: eligibleFreeAgents.length,
      competitiveRetirements: retirementDemand.reduce((sum, c) => sum + c.competitiveRetirements, 0),
      regens: query('SELECT COUNT(*) AS n FROM Player WHERE isRegen = 1')[0].n,
    },
    rosterDistribution: teams.reduce((counts, t) => {
      counts[t.starters] = (counts[t.starters] || 0) + 1;
      return counts;
    }, {}),
    eligibleFreeAgents, retirementDemand, overlappingSniperStints, examples,
  }, null, 2));
} finally {
  db.exec('ROLLBACK');
  db.close();
}
