import express from 'express';
import db from '../db.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const pitScouts = db.prepare('SELECT * FROM pit_scouts').all();
    const matchScouts = db.prepare('SELECT * FROM match_scouts').all();

    const formattedPitScouts = pitScouts.map((row: any) => ({
      id: row.id,
      type: 'pitScout',
      timestamp: new Date(row.updated_at).getTime(),
      data: JSON.parse(row.data),
    }));

    const formattedMatchScouts = matchScouts.map((row: any) => ({
      id: row.id,
      type: 'matchScout',
      timestamp: new Date(row.updated_at).getTime(),
      data: JSON.parse(row.data),
    }));

    res.json({
      pitScouts: formattedPitScouts,
      matchScouts: formattedMatchScouts,
    });
  } catch (error) {
    console.error('Data fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

export default router;
