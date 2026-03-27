export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const team = req.query?.team;
  if (!team || Array.isArray(team)) {
    return res.status(400).json({ error: 'team query parameter is required' });
  }

  const normalizedTeamNumber = Number(team);
  if (!Number.isInteger(normalizedTeamNumber) || normalizedTeamNumber <= 0) {
    return res.status(400).json({ error: 'team must be a positive integer' });
  }

  const targetUrl = `https://api.statbotics.io/v3/team_years?team=${normalizedTeamNumber}`;

  console.log('[api/statbotics/team_years] request', {
    teamNumber: normalizedTeamNumber,
    targetUrl,
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(timeout);
    const body = await response.text();

    if (!response.ok) {
      console.error('[api/statbotics/team_years] upstream failed', {
        teamNumber: normalizedTeamNumber,
        status: response.status,
      });
      return res.status(response.status).json({ error: `Statbotics request failed with status ${response.status}` });
    }

    const payload = JSON.parse(body);
    console.log('[api/statbotics/team_years] success', {
      teamNumber: normalizedTeamNumber,
      rows: Array.isArray(payload) ? payload.length : 0,
    });
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=604800');
    return res.status(200).json(payload);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return res.status(504).json({ error: 'Statbotics team_years request timed out' });
    }
    console.error('[api/statbotics/team_years] exception', {
      teamNumber: normalizedTeamNumber,
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: 'Failed to fetch team years from Statbotics' });
  }
}
