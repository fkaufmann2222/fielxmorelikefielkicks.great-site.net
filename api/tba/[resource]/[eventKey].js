const RESOURCE_MAP = {
  event: {
    pathSuffix: 'simple',
    errorMessage: 'Failed to fetch event info from TBA',
    logName: 'event',
  },
  teams: {
    pathSuffix: 'teams/simple',
    errorMessage: 'Failed to fetch teams from TBA',
    logName: 'teams',
  },
  matches: {
    pathSuffix: 'matches/simple',
    errorMessage: 'Failed to fetch matches from TBA',
    logName: 'matches',
  },
  rankings: {
    pathSuffix: 'rankings',
    errorMessage: 'Failed to fetch rankings from TBA',
    logName: 'rankings',
  },
  team_matches_year: {
    errorMessage: 'Failed to fetch team matches from TBA',
    logName: 'team_matches_year',
  },
  match_detail: {
    errorMessage: 'Failed to fetch match detail from TBA',
    logName: 'match_detail',
  },
};

function parseTeamYearTarget(value) {
  const raw = value.trim().toLowerCase();
  const parts = raw.split('-');
  if (parts.length !== 2) {
    throw new Error('team_matches_year target must be <teamNumber>-<year>');
  }

  const teamNumber = Number(parts[0]);
  const seasonYear = Number(parts[1]);

  if (!Number.isInteger(teamNumber) || teamNumber <= 0) {
    throw new Error('team_matches_year target must include a valid team number');
  }

  if (!Number.isInteger(seasonYear) || seasonYear < 1992 || seasonYear > 2100) {
    throw new Error('team_matches_year target must include a valid FRC year');
  }

  return {
    teamKey: `frc${teamNumber}`,
    seasonYear,
  };
}

function resolveResourcePath(resource, targetValue) {
  const normalizedTargetValue = targetValue.trim().toLowerCase();

  if (!normalizedTargetValue) {
    throw new Error('eventKey is required');
  }

  if (resource === 'team_matches_year') {
    const parsed = parseTeamYearTarget(normalizedTargetValue);
    return `/team/${parsed.teamKey}/matches/${parsed.seasonYear}/simple`;
  }

  if (resource === 'match_detail') {
    return `/match/${encodeURIComponent(normalizedTargetValue)}`;
  }

  const config = RESOURCE_MAP[resource];
  if (!config?.pathSuffix) {
    throw new Error('Unsupported TBA resource');
  }

  return `/event/${normalizedTargetValue}/${config.pathSuffix}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.TBA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'TBA_API_KEY is not configured' });
  }

  const resource = req.query?.resource;
  const eventKey = req.query?.eventKey;
  if (!resource || Array.isArray(resource) || !eventKey || Array.isArray(eventKey)) {
    return res.status(400).json({ error: 'resource and eventKey are required' });
  }

  const config = RESOURCE_MAP[resource];
  if (!config) {
    return res.status(400).json({ error: 'Unsupported TBA resource' });
  }

  const normalizedEventKey = eventKey.trim().toLowerCase();
  let path = '';
  try {
    path = resolveResourcePath(resource, normalizedEventKey);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid TBA request target' });
  }

  console.log(`[api/tba/${config.logName}] request`, {
    originalEventKey: eventKey,
    normalizedEventKey,
    path,
  });

  try {
    const response = await fetch(
      `https://www.thebluealliance.com/api/v3${path}`,
      {
        headers: {
          'X-TBA-Auth-Key': apiKey,
        },
      },
    );

    if (!response.ok) {
      console.error(`[api/tba/${config.logName}] upstream failed`, {
        normalizedEventKey,
        status: response.status,
      });
      return res.status(response.status).json({ error: `TBA request failed with status ${response.status}` });
    }

    const data = await response.json();
    console.log(`[api/tba/${config.logName}] success`, {
      normalizedEventKey,
      count: Array.isArray(data) ? data.length : null,
      eventName: !Array.isArray(data) ? data?.name || null : null,
    });
    return res.status(200).json(data);
  } catch (error) {
    console.error(`[api/tba/${config.logName}] exception`, {
      normalizedEventKey,
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: config.errorMessage });
  }
}