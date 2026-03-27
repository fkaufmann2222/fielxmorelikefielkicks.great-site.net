export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const team = req.query?.team;
  const eventKey = req.query?.eventKey;

  if (!team || Array.isArray(team)) {
    return res.status(400).json({ error: 'team query parameter is required' });
  }

  if (!eventKey || Array.isArray(eventKey)) {
    return res.status(400).json({ error: 'eventKey query parameter is required' });
  }

  const normalizedTeamNumber = Number(team);
  const normalizedEventKey = eventKey.trim().toLowerCase();

  if (!Number.isInteger(normalizedTeamNumber) || normalizedTeamNumber <= 0) {
    return res.status(400).json({ error: 'team must be a positive integer' });
  }

  const targetUrl = `https://api.statbotics.io/v3/team_event/${normalizedTeamNumber}/${encodeURIComponent(normalizedEventKey)}`;

  console.log('[api/statbotics/team_event] request', {
    teamNumber: normalizedTeamNumber,
    originalEventKey: eventKey,
    normalizedEventKey,
    targetUrl,
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(timeout);
    const body = await response.text();

    if (!response.ok) {
      console.error('[api/statbotics/team_event] upstream failed', {
        teamNumber: normalizedTeamNumber,
        normalizedEventKey,
        status: response.status,
      });
      return res.status(response.status).json({ error: `Statbotics request failed with status ${response.status}` });
    }

    const payload = JSON.parse(body);
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=21600');
    return res.status(200).json(payload);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return res.status(504).json({ error: 'Statbotics team_event request timed out' });
    }
    console.error('[api/statbotics/team_event] exception', {
      teamNumber: normalizedTeamNumber,
      normalizedEventKey,
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: 'Failed to fetch team event from Statbotics' });
  }
}
