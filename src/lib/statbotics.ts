import { tba } from './tba';

const EVENT_TEAMS_TTL_MS = 5 * 60 * 1000;
const TEAM_EVENT_TTL_MS = 5 * 60 * 1000;
const EVENT_TEAMS_TIMEOUT_MS = 9000;
const TEAM_EVENT_TIMEOUT_MS = 3500;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const eventTeamsCache = new Map<string, CacheEntry<StatboticsTeamEvent[] | null>>();
const teamEventCache = new Map<string, CacheEntry<StatboticsTeamEvent | null>>();
const eventTeamsInFlight = new Map<string, Promise<StatboticsTeamEvent[] | null>>();
const teamEventInFlight = new Map<string, Promise<StatboticsTeamEvent | null>>();

function readFreshCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function writeCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number): void {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

async function fetchWithTimeout(input: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export type StatboticsTeamEvent = {
  team?: number;
  team_number?: number;
  event?: string;
  epa?: {
    total_points?: number;
    auto_points?: number;
    teleop_points?: number;
    endgame_points?: number;
  };
  norm_epa?: number;
  rank?: number;
  record?: {
    wins?: number;
    losses?: number;
    ties?: number;
  };
  winrate?: number;
  rp_1_rate?: number;
  rp_2_rate?: number;
  [key: string]: unknown;
};

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function pickFirstNumber(data: unknown, keys: string[]): number | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  for (const key of keys) {
    const parts = key.split('.');
    let current: unknown = data;

    for (const part of parts) {
      if (typeof current !== 'object' || current === null) {
        current = null;
        break;
      }

      current = (current as Record<string, unknown>)[part];
    }

    const parsed = toNumber(current);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function normalizeTeamEvent(rawRow: StatboticsTeamEvent): StatboticsTeamEvent {
  const totalPoints = pickFirstNumber(rawRow, ['epa.total_points.mean', 'epa.breakdown.total_points', 'epa.total_points']);
  const autoPoints = pickFirstNumber(rawRow, ['epa.breakdown.auto_points', 'epa.auto_points']);
  const teleopPoints = pickFirstNumber(rawRow, ['epa.breakdown.teleop_points', 'epa.breakdown.teleoppoints', 'epa.teleop_points']);
  const endgamePoints = pickFirstNumber(rawRow, ['epa.breakdown.endgame_points', 'epa.endgame_points']);
  const winrate = pickFirstNumber(rawRow, ['winrate', 'record.total.winrate', 'record.qual.winrate']);
  const rank = pickFirstNumber(rawRow, ['rank', 'record.qual.rank']);

  const rawEPA = rawRow.epa && typeof rawRow.epa === 'object' ? rawRow.epa : {};
  const normalizedEPA: Record<string, unknown> = { ...rawEPA };

  if (totalPoints !== null) normalizedEPA.total_points = totalPoints;
  if (autoPoints !== null) normalizedEPA.auto_points = autoPoints;
  if (teleopPoints !== null) normalizedEPA.teleop_points = teleopPoints;
  if (endgamePoints !== null) normalizedEPA.endgame_points = endgamePoints;

  return {
    ...rawRow,
    rank: rawRow.rank ?? rank ?? undefined,
    winrate: rawRow.winrate ?? winrate ?? undefined,
    epa: normalizedEPA,
  };
}

async function fetchTeamEvent(teamNumber: number, eventKey: string): Promise<StatboticsTeamEvent | null> {
  const normalizedEventKey = eventKey.trim().toLowerCase();
  const cacheKey = `${teamNumber}:${normalizedEventKey}`;

  const cached = readFreshCache(teamEventCache, cacheKey);
  if (cached !== null) {
    return cached;
  }

  const inFlight = teamEventInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const requestUrl = `/api/statbotics/team_event?team=${teamNumber}&eventKey=${encodeURIComponent(eventKey)}`;

  const request = (async () => {
    const startedAt = performance.now();
    const response = await fetchWithTimeout(requestUrl, TEAM_EVENT_TIMEOUT_MS);
    const responseAt = performance.now();

    console.log('[statbotics] teamEvent:response', {
      teamNumber,
      eventKey,
      ok: response.ok,
      status: response.status,
      ms: Math.round(responseAt - startedAt),
    });

    if (!response.ok) {
      writeCache(teamEventCache, cacheKey, null, Math.floor(TEAM_EVENT_TTL_MS / 3));
      return null;
    }

    const payload = (await response.json()) as StatboticsTeamEvent;
    const normalized = normalizeTeamEvent(payload);
    writeCache(teamEventCache, cacheKey, normalized, TEAM_EVENT_TTL_MS);
    return normalized;
  })()
    .catch((error) => {
      return null;
    })
    .finally(() => {
      teamEventInFlight.delete(cacheKey);
    });

  teamEventInFlight.set(cacheKey, request);
  return request;
}

async function fetchEventTeamsByTeam(eventKey: string, teamNumbers: number[]): Promise<StatboticsTeamEvent[]> {
  const startedAt = performance.now();

  console.log('[statbotics] teamEvent:fallback-start', {
    eventKey,
    teamsRequested: teamNumbers.length,
  });

  const settled = await Promise.allSettled(teamNumbers.map((teamNumber) => fetchTeamEvent(teamNumber, eventKey)));

  const rows: StatboticsTeamEvent[] = [];
  let missingRows = 0;

  for (const result of settled) {
    if (result.status !== 'fulfilled' || !result.value) {
      missingRows += 1;
      continue;
    }
    rows.push(result.value);
  }

  const completedAt = performance.now();
  console.log('[statbotics] teamEvent:fallback-complete', {
    eventKey,
    teamsRequested: teamNumbers.length,
    rowsReturned: rows.length,
    missingRows,
    ms: Math.round(completedAt - startedAt),
  });

  return rows;
}

async function fetchEventTeams(eventKey: string): Promise<StatboticsTeamEvent[] | null> {
  const normalizedEventKey = eventKey.trim().toLowerCase();
  const cacheKey = normalizedEventKey;

  const cached = readFreshCache(eventTeamsCache, cacheKey);
  if (cached !== null) {
    return cached;
  }

  const inFlight = eventTeamsInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const requestUrl = `/api/statbotics/teams_by_event?eventKey=${encodeURIComponent(eventKey)}`;

  const request = (async () => {
    const startedAt = performance.now();

    console.log('[statbotics] eventTeams:request', { eventKey, requestUrl });
    const response = await fetchWithTimeout(requestUrl, EVENT_TEAMS_TIMEOUT_MS);
    const responseAt = performance.now();

    console.log('[statbotics] eventTeams:response', {
      eventKey,
      ok: response.ok,
      status: response.status,
      ms: Math.round(responseAt - startedAt),
    });

    if (!response.ok) {
      console.error('[statbotics] eventTeams:failed', { eventKey, status: response.status });

      try {
        const cachedTeams = tba.getTeams();
        const teams = cachedTeams.length > 0 ? cachedTeams : await tba.fetchTeams(eventKey);
        const fallbackRows = await fetchEventTeamsByTeam(
          eventKey,
          teams.map((team) => team.team_number),
        );

        if (fallbackRows.length > 0) {
          console.log('[statbotics] eventTeams:fallback-success', {
            eventKey,
            rows: fallbackRows.length,
          });
          writeCache(eventTeamsCache, cacheKey, fallbackRows, EVENT_TEAMS_TTL_MS);
          return fallbackRows;
        }

        const tbaFallback = teams.map((team) => ({
          team_number: team.team_number,
          nickname: team.nickname || team.name || `Team ${team.team_number}`,
          epa: {},
        })) as StatboticsTeamEvent[];

        writeCache(eventTeamsCache, cacheKey, tbaFallback, Math.floor(EVENT_TEAMS_TTL_MS / 3));
        return tbaFallback;
      } catch (error) {
        console.error('[statbotics] eventTeams:fallback-failed', {
          eventKey,
          error: String(error),
        });
      }

      writeCache(eventTeamsCache, cacheKey, null, Math.floor(EVENT_TEAMS_TTL_MS / 3));
      return null;
    }

    const payload: unknown = await response.json();
    const parsedAt = performance.now();

    if (Array.isArray(payload)) {
      console.log('[statbotics] eventTeams:payload', {
        eventKey,
        shape: 'array',
        rows: payload.length,
        parseMs: Math.round(parsedAt - responseAt),
        sampleKeys: Object.keys(payload[0] ?? {}),
      });
      const normalized = (payload as StatboticsTeamEvent[]).map(normalizeTeamEvent);
      writeCache(eventTeamsCache, cacheKey, normalized, EVENT_TEAMS_TTL_MS);
      return normalized;
    }

    if (payload && typeof payload === 'object') {
      const nestedTeams = (payload as { teams?: unknown }).teams;
      if (Array.isArray(nestedTeams)) {
        console.log('[statbotics] eventTeams:payload', {
          eventKey,
          shape: 'object.teams',
          rows: nestedTeams.length,
          parseMs: Math.round(parsedAt - responseAt),
          sampleKeys: Object.keys((nestedTeams[0] ?? {}) as Record<string, unknown>),
        });
        const normalized = (nestedTeams as StatboticsTeamEvent[]).map(normalizeTeamEvent);
        writeCache(eventTeamsCache, cacheKey, normalized, EVENT_TEAMS_TTL_MS);
        return normalized;
      }
    }

    console.warn('[statbotics] eventTeams:payload-unexpected-shape', {
      eventKey,
      payloadType: typeof payload,
      parseMs: Math.round(parsedAt - responseAt),
    });

    writeCache(eventTeamsCache, cacheKey, [], Math.floor(EVENT_TEAMS_TTL_MS / 2));
    return [];
  })()
    .catch((error) => {
      return null;
    })
    .finally(() => {
      eventTeamsInFlight.delete(cacheKey);
    });

  eventTeamsInFlight.set(cacheKey, request);
  return request;
}

export const statbotics = {
  fetchEventTeams,
  fetchEventTeamsByTeam,
  fetchTeamEvent,
};
