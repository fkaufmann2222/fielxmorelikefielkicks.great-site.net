export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const team = req.query?.team;
  const eventKey = req.query?.eventKey || req.query?.event || req.query?.event_key;
  const year = req.query?.year || req.query?.season;

  if (!team || Array.isArray(team)) {
    return res.status(400).json({ error: 'team query parameter is required' });
  }

  const normalizedTeamNumber = Number(team);

  if (!Number.isInteger(normalizedTeamNumber) || normalizedTeamNumber <= 0) {
    return res.status(400).json({ error: 'team must be a positive integer' });
  }

  const normalizedEventKey = !eventKey || Array.isArray(eventKey)
    ? ''
    : String(eventKey).trim().toLowerCase();

  const normalizedYear = !year || Array.isArray(year)
    ? null
    : Number(year);

  if (!normalizedEventKey && (!normalizedYear || !Number.isInteger(normalizedYear))) {
    return res.status(400).json({ error: 'eventKey or year query parameter is required' });
  }

  const candidateUrls = [];
  if (normalizedYear && Number.isInteger(normalizedYear)) {
    candidateUrls.push(
      `https://api.statbotics.io/v3/team_matches?team=${normalizedTeamNumber}&year=${normalizedYear}`,
      `https://api.statbotics.io/v3/team_matches?team=${normalizedTeamNumber}&season=${normalizedYear}`,
    );
  }

  if (normalizedEventKey) {
    candidateUrls.push(
      `https://api.statbotics.io/v3/team_matches?team=${normalizedTeamNumber}&event=${encodeURIComponent(normalizedEventKey)}`,
      `https://api.statbotics.io/v3/team_matches?team=${normalizedTeamNumber}&event_key=${encodeURIComponent(normalizedEventKey)}`,
    );
  }

  let lastErrorStatus = 500;
  let lastErrorMessage = 'Failed to fetch team matches from Statbotics';

  for (const targetUrl of candidateUrls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const response = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timeout);
      const body = await response.text();

      if (!response.ok) {
        lastErrorStatus = response.status;
        lastErrorMessage = `Statbotics request failed with status ${response.status}`;
        continue;
      }

      const payload = JSON.parse(body);
      res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=21600');
      return res.status(200).json(payload);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        lastErrorStatus = 504;
        lastErrorMessage = 'Statbotics team_matches request timed out';
        continue;
      }
      lastErrorStatus = 500;
      lastErrorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  return res.status(lastErrorStatus).json({ error: lastErrorMessage });
}
