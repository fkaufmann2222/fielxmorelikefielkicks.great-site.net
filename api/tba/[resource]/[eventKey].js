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

const HARDCODED_TEAMS_BY_EVENT = {
  '2026mrcmp': [
    { team_number: 11, nickname: 'MORT', city: 'Flanders', state_prov: 'New Jersey' },
    { team_number: 25, nickname: 'Raider Robotix', city: 'North Brunswick', state_prov: 'New Jersey' },
    { team_number: 41, nickname: 'RoboWarriors', city: 'Warren', state_prov: 'New Jersey' },
    { team_number: 56, nickname: 'R.O.B.B.E.', city: 'Bound Brook', state_prov: 'New Jersey' },
    { team_number: 75, nickname: 'RoboRaiders', city: 'Hillsborough', state_prov: 'New Jersey' },
    { team_number: 103, nickname: 'Cybersonics', city: 'Kintnersville', state_prov: 'Pennsylvania' },
    { team_number: 193, nickname: 'MORT Beta', city: 'Flanders', state_prov: 'New Jersey' },
    { team_number: 222, nickname: 'Tigertrons', city: 'Tunkhannock', state_prov: 'Pennsylvania' },
    { team_number: 223, nickname: 'Xtreme Heat', city: 'Wanaque', state_prov: 'New Jersey' },
    { team_number: 272, nickname: 'Cyber Crusaders', city: 'Lansdale', state_prov: 'Pennsylvania' },
    { team_number: 293, nickname: 'SPIKE', city: 'Pennington', state_prov: 'New Jersey' },
    { team_number: 303, nickname: 'The T.E.S.T. Team', city: 'Bridgewater', state_prov: 'New Jersey' },
    { team_number: 316, nickname: 'LUNATECS', city: 'Carneys Point', state_prov: 'New Jersey' },
    { team_number: 341, nickname: 'Miss Daisy', city: 'Ambler', state_prov: 'Pennsylvania' },
    { team_number: 365, nickname: 'Miracle Workerz', city: 'Wilmington', state_prov: 'Delaware' },
    { team_number: 423, nickname: 'Simple Machines', city: 'Elkins Park', state_prov: 'Pennsylvania' },
    { team_number: 427, nickname: 'LANCE-A-LOT', city: 'Philadelphia', state_prov: 'Pennsylvania' },
    { team_number: 433, nickname: 'Firebirds', city: 'Flourtown', state_prov: 'Pennsylvania' },
    { team_number: 484, nickname: 'Roboforce', city: 'Havertown', state_prov: 'Pennsylvania' },
    { team_number: 486, nickname: 'Positronic Panthers', city: 'Wallingford', state_prov: 'Pennsylvania' },
    { team_number: 555, nickname: 'Montclair Robotics', city: 'Montclair', state_prov: 'New Jersey' },
    { team_number: 708, nickname: 'Hatters Robotics', city: 'Horsham', state_prov: 'Pennsylvania' },
    { team_number: 1089, nickname: 'Team Mercury', city: 'Hightstown', state_prov: 'New Jersey' },
    { team_number: 1168, nickname: 'Malvern Robotics', city: 'Malvern', state_prov: 'Pennsylvania' },
    { team_number: 1218, nickname: 'SCH Robotics', city: 'Philadelphia', state_prov: 'Pennsylvania' },
    { team_number: 1391, nickname: 'The Metal Moose', city: 'West Chester', state_prov: 'Pennsylvania' },
    { team_number: 1403, nickname: 'Team 1403 Cougar Robotics', city: 'Skillman', state_prov: 'New Jersey' },
    { team_number: 1640, nickname: 'Sab-BOT-age', city: 'Downingtown', state_prov: 'Pennsylvania' },
    { team_number: 1672, nickname: 'Robo T-Birds', city: 'Mahwah', state_prov: 'New Jersey' },
    { team_number: 1676, nickname: 'The Pascack PI-oneers', city: 'Montvale', state_prov: 'New Jersey' },
    { team_number: 1712, nickname: 'Dawgma', city: 'Ardmore', state_prov: 'Pennsylvania' },
    { team_number: 1807, nickname: 'Redbird Robotics', city: 'Allentown', state_prov: 'New Jersey' },
    { team_number: 1923, nickname: 'The MidKnight Inventors', city: 'Plainsboro', state_prov: 'New Jersey' },
    { team_number: 2016, nickname: 'Mighty Monkey Wrenches', city: 'Ewing', state_prov: 'New Jersey' },
    { team_number: 2539, nickname: 'Krypton Cougars', city: 'Palmyra', state_prov: 'Pennsylvania' },
    { team_number: 2554, nickname: 'The Warhawks', city: 'Edison', state_prov: 'New Jersey' },
    { team_number: 2590, nickname: 'Nemesis', city: 'Robbinsville', state_prov: 'New Jersey' },
    { team_number: 2607, nickname: 'The Fighting RoboVikings', city: 'Warminster', state_prov: 'Pennsylvania' },
    { team_number: 3314, nickname: 'Mechanical Mustangs', city: 'Clifton', state_prov: 'New Jersey' },
    { team_number: 3637, nickname: 'The Daleks', city: 'Flemington', state_prov: 'New Jersey' },
    { team_number: 4285, nickname: 'Camo-Bots', city: 'Honesdale', state_prov: 'Pennsylvania' },
    { team_number: 4575, nickname: 'Gemini', city: 'Media', state_prov: 'Pennsylvania' },
    { team_number: 5113, nickname: 'Combustible Lemons', city: 'Moorestown', state_prov: 'New Jersey' },
    { team_number: 5181, nickname: 'Explorer Robotics', city: 'Wyndmoor', state_prov: 'Pennsylvania' },
    { team_number: 5401, nickname: "Fightin' Robotic Owls", city: 'Bensalem', state_prov: 'Pennsylvania' },
    { team_number: 5438, nickname: 'Technological Terrors', city: 'Jersey City', state_prov: 'New Jersey' },
    { team_number: 5895, nickname: 'Peddie Robotics', city: 'Hightstown', state_prov: 'New Jersey' },
    { team_number: 6921, nickname: 'Technados', city: 'Pennsauken', state_prov: 'New Jersey' },
    { team_number: 7045, nickname: 'MCCrusaders', city: 'Denville', state_prov: 'New Jersey' },
    { team_number: 7110, nickname: 'Heights Bytes', city: 'Haddon Heights', state_prov: 'New Jersey' },
    { team_number: 7587, nickname: 'Metuchen Momentum', city: 'Metuchen', state_prov: 'New Jersey' },
    { team_number: 8075, nickname: 'CyberTigers', city: 'Dover', state_prov: 'New Jersey' },
    { team_number: 8117, nickname: 'Easton RoboRovers', city: 'Easton', state_prov: 'Pennsylvania' },
    { team_number: 8513, nickname: 'Sisters 1st', city: 'Morristown', state_prov: 'New Jersey' },
    { team_number: 8706, nickname: 'MXS Bulldog Bots', city: 'Newark', state_prov: 'New Jersey' },
    { team_number: 9015, nickname: 'Questionable Engineering', city: 'Jersey City', state_prov: 'New Jersey' },
    { team_number: 9027, nickname: 'PATH to Domination', city: 'Norristown', state_prov: 'Pennsylvania' },
    { team_number: 9094, nickname: 'The Earthquakers', city: 'Wynnewood', state_prov: 'Pennsylvania' },
    { team_number: 9416, nickname: 'International Θperatives of World Affairs', city: 'Philadelphia', state_prov: 'Pennsylvania' },
    { team_number: 10070, nickname: 'Ghost Bots', city: 'Abington', state_prov: 'Pennsylvania' },
    { team_number: 10157, nickname: 'Roman Robotics', city: 'Philadelphia', state_prov: 'Pennsylvania' },
    { team_number: 10584, nickname: 'Ridge Robotics', city: 'Perkasie', state_prov: 'Pennsylvania' },
    { team_number: 10918, nickname: 'Bluesteel Dragons', city: 'Philadelphia', state_prov: 'Pennsylvania' },
    { team_number: 10949, nickname: 'Metalheads', city: 'Philadelphia', state_prov: 'Pennsylvania' },
    { team_number: 10979, nickname: 'Tiger Robotics', city: 'Philadelphia', state_prov: 'Pennsylvania' },
    { team_number: 10993, nickname: 'EP Robotics', city: 'Enola', state_prov: 'Pennsylvania' },
  ],
};

function createHardcodedTeamRows(eventKey) {
  const rows = HARDCODED_TEAMS_BY_EVENT[eventKey];
  if (!rows) {
    return null;
  }

  return rows.map((row) => ({
    key: `frc${row.team_number}`,
    team_number: row.team_number,
    nickname: row.nickname,
    // TBA clients commonly expect both fields; source list only provides one display name.
    name: row.nickname,
    city: row.city,
    state_prov: row.state_prov,
    country: 'USA',
  }));
}

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

async function fetchAllEventTeamsFromTba(eventKey, apiKey) {
  const allTeams = [];
  const seenTeamNumbers = new Set();

  for (let page = 0; page < 100; page += 1) {
    const response = await fetch(
      `https://www.thebluealliance.com/api/v3/event/${encodeURIComponent(eventKey)}/teams/${page}/simple`,
      {
        headers: {
          'X-TBA-Auth-Key': apiKey,
        },
      },
    );

    if (!response.ok) {
      if (page > 0 && response.status === 404) {
        break;
      }

      throw new Error(`TBA request failed with status ${response.status}`);
    }

    const pageData = await response.json();
    if (!Array.isArray(pageData) || pageData.length === 0) {
      break;
    }

    pageData.forEach((team) => {
      const teamNumber = Number(team?.team_number);
      if (!Number.isInteger(teamNumber) || teamNumber <= 0 || seenTeamNumbers.has(teamNumber)) {
        return;
      }

      seenTeamNumbers.add(teamNumber);
      allTeams.push(team);
    });
  }

  return allTeams;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
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

  if (resource === 'teams') {
    const hardcodedTeams = createHardcodedTeamRows(normalizedEventKey);
    if (hardcodedTeams) {
      console.log('[api/tba/teams] hardcoded roster used', {
        normalizedEventKey,
        count: hardcodedTeams.length,
      });
      return res.status(200).json(hardcodedTeams);
    }
  }

  const apiKey = process.env.TBA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'TBA_API_KEY is not configured' });
  }

  try {
    if (resource === 'teams') {
      const teams = await fetchAllEventTeamsFromTba(normalizedEventKey, apiKey);
      console.log('[api/tba/teams] success', {
        normalizedEventKey,
        count: teams.length,
      });
      return res.status(200).json(teams);
    }

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
