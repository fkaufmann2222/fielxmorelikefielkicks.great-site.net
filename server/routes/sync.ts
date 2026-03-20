import express from 'express';
import db from '../db.js';

const router = express.Router();

router.post('/', (req, res) => {
  const records = req.body;
  if (!Array.isArray(records)) {
    return res.status(400).json({ success: false, error: 'Expected an array of records' });
  }

  let count = 0;

  try {
    const insertPit = db.prepare(`
      INSERT INTO pit_scouts (id, team_number, data, updated_at)
      VALUES (@id, @team_number, @data, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        team_number = excluded.team_number,
        data = excluded.data,
        updated_at = excluded.updated_at
    `);

    const insertMatch = db.prepare(`
      INSERT INTO match_scouts (id, match_number, team_number, alliance, data, updated_at)
      VALUES (@id, @match_number, @team_number, @alliance, @data, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        match_number = excluded.match_number,
        team_number = excluded.team_number,
        alliance = excluded.alliance,
        data = excluded.data,
        updated_at = excluded.updated_at
    `);

    const transaction = db.transaction((recordsToInsert) => {
      for (const record of recordsToInsert) {
        if (record.type === 'pitScout') {
          insertPit.run({
            id: record.id,
            team_number: record.data.teamNumber,
            data: JSON.stringify(record.data),
            updated_at: new Date(record.timestamp).toISOString(),
          });
          count++;
        } else if (record.type === 'matchScout') {
          insertMatch.run({
            id: record.id,
            match_number: record.data.matchNumber,
            team_number: record.data.teamNumber,
            alliance: record.data.allianceColor,
            data: JSON.stringify(record.data),
            updated_at: new Date(record.timestamp).toISOString(),
          });
          count++;
        }
      }
    });

    transaction(records);
    res.json({ success: true, count });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ success: false, error: 'Internal server error during sync' });
  }
});

export default router;
