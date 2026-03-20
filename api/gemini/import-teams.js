import { createClient } from '@supabase/supabase-js';

function toInteger(value) {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }

  return null;
}

function toNullableNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeRecord(record) {
  const teamNumber = toInteger(record?.teamNumber);
  if (!teamNumber) {
    return null;
  }

  const previousCompRank = typeof record?.previousCompRank === 'string' && record.previousCompRank.trim() !== ''
    ? record.previousCompRank.trim()
    : 'N/A';

  const autoFuelCount = toNullableNumber(record?.autoFuelCount);
  const autoNotes = typeof record?.autoNotes === 'string' ? record.autoNotes.trim() : '';

  return {
    team_number: teamNumber,
    previous_comp_rank: previousCompRank,
    auto_fuel_count: autoFuelCount,
    auto_notes: autoNotes,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const records = req.body?.records;
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'records must be a non-empty array' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Supabase server credentials are not configured' });
  }

  const normalizedRows = records
    .map(normalizeRecord)
    .filter(Boolean);

  if (normalizedRows.length === 0) {
    return res.status(200).json({ parsed: records.length, added: 0, updated: 0, skipped: records.length });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const teamNumbers = normalizedRows.map((row) => row.team_number);

    const { data: existingRows, error: existingError } = await supabase
      .from('team_imports')
      .select('team_number')
      .in('team_number', teamNumbers);

    if (existingError) {
      return res.status(500).json({ error: existingError.message || 'Failed to check existing teams' });
    }

    const existingTeamNumbers = new Set((existingRows || []).map((row) => row.team_number));

    const { error: upsertError } = await supabase
      .from('team_imports')
      .upsert(normalizedRows, { onConflict: 'team_number' });

    if (upsertError) {
      return res.status(500).json({ error: upsertError.message || 'Failed to import teams' });
    }

    const updated = normalizedRows.filter((row) => existingTeamNumbers.has(row.team_number)).length;
    const added = normalizedRows.length - updated;
    const skipped = records.length - normalizedRows.length;

    return res.status(200).json({ parsed: records.length, added, updated, skipped });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to import teams' });
  }
}
