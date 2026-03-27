import { useEffect, useMemo, useState } from 'react';
import { listAssignmentsForTeam } from '../../../lib/supabase';
import { ScoutAssignment } from '../../../types';
import { RawEntry, RawMatchPoint, RawerMatchRecord } from '../types';
import { asAutonPathData, asMatchPayload, getPayloadEventKey, normalizeNoteText, toNumber } from '../utils';

type UseRawerMatchRecordsArgs = {
  selectedTeam: number | null;
  selectedTeamMatchEntries: RawEntry[];
  isGlobalScope: boolean;
  activeEventKey: string;
  scoutProfiles?: Array<{ id: string; name: string }>;
};

type UseRawerMatchRecordsResult = {
  rawerMatchRecords: RawerMatchRecord[];
  isLoadingCollectorFallback: boolean;
  collectorFallbackError: string | null;
};

type AssignmentAggregate = {
  completedScoutIds: Set<string>;
  allScoutIds: Set<string>;
};

function sanitizeCollectorId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toPointList(value: unknown): RawMatchPoint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((point) => {
      if (!point || typeof point !== 'object') {
        return null;
      }

      const candidate = point as Record<string, unknown>;
      const x = toNumber(candidate.x);
      const y = toNumber(candidate.y);
      const timestampMs = toNumber(candidate.timestampMs);

      if (x === null || y === null || timestampMs === null) {
        return null;
      }

      return {
        x,
        y,
        timestampMs,
      };
    })
    .filter((point): point is RawMatchPoint => point !== null);
}

function buildAssignmentLookup(assignments: ScoutAssignment[]): Map<string, string | null> {
  const aggregate = new Map<string, AssignmentAggregate>();

  assignments.forEach((assignment) => {
    const eventKey = assignment.eventKey.trim().toLowerCase();
    const scoutProfileId = assignment.scoutProfileId.trim();

    if (!eventKey || !scoutProfileId) {
      return;
    }

    const key = `${eventKey}:${assignment.matchNumber}:${assignment.teamNumber}`;
    const existing = aggregate.get(key) || {
      completedScoutIds: new Set<string>(),
      allScoutIds: new Set<string>(),
    };

    existing.allScoutIds.add(scoutProfileId);
    if (assignment.status === 'completed') {
      existing.completedScoutIds.add(scoutProfileId);
    }

    aggregate.set(key, existing);
  });

  const resolved = new Map<string, string | null>();

  aggregate.forEach((value, key) => {
    if (value.completedScoutIds.size === 1) {
      resolved.set(key, Array.from(value.completedScoutIds)[0]);
      return;
    }

    if (value.completedScoutIds.size > 1) {
      resolved.set(key, null);
      return;
    }

    if (value.allScoutIds.size === 1) {
      resolved.set(key, Array.from(value.allScoutIds)[0]);
      return;
    }

    resolved.set(key, null);
  });

  return resolved;
}

export function useRawerMatchRecords({
  selectedTeam,
  selectedTeamMatchEntries,
  isGlobalScope,
  activeEventKey,
  scoutProfiles,
}: UseRawerMatchRecordsArgs): UseRawerMatchRecordsResult {
  const [assignmentFallbackRows, setAssignmentFallbackRows] = useState<ScoutAssignment[]>([]);
  const [isLoadingCollectorFallback, setIsLoadingCollectorFallback] = useState(false);
  const [collectorFallbackError, setCollectorFallbackError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadAssignmentFallbackRows = async () => {
      if (!selectedTeam || selectedTeam <= 0) {
        setAssignmentFallbackRows([]);
        setCollectorFallbackError(null);
        setIsLoadingCollectorFallback(false);
        return;
      }

      setIsLoadingCollectorFallback(true);
      setCollectorFallbackError(null);

      try {
        const rows = await listAssignmentsForTeam({
          teamNumber: selectedTeam,
          eventKey: isGlobalScope ? null : activeEventKey,
        });

        if (!cancelled) {
          setAssignmentFallbackRows(rows);
        }
      } catch (error) {
        if (!cancelled) {
          setAssignmentFallbackRows([]);
          setCollectorFallbackError(error instanceof Error ? error.message : 'Failed to load assignment fallback rows.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCollectorFallback(false);
        }
      }
    };

    void loadAssignmentFallbackRows();

    return () => {
      cancelled = true;
    };
  }, [activeEventKey, isGlobalScope, selectedTeam]);

  const scoutNameById = useMemo(() => {
    const map = new Map<string, string>();

    (scoutProfiles || []).forEach((profile) => {
      const id = profile.id.trim();
      const name = profile.name.trim();
      if (!id || !name) {
        return;
      }

      map.set(id, name);
    });

    return map;
  }, [scoutProfiles]);

  const assignmentCollectorByMatchKey = useMemo(() => {
    return buildAssignmentLookup(assignmentFallbackRows);
  }, [assignmentFallbackRows]);

  const rawerMatchRecords = useMemo(() => {
    if (!selectedTeam || selectedTeam <= 0) {
      return [];
    }

    return selectedTeamMatchEntries
      .map((entry) => {
        const payload = asMatchPayload(entry.payload);
        if (!payload) {
          return null;
        }

        const payloadEventKey = getPayloadEventKey(payload);
        const eventKey = payloadEventKey || (!isGlobalScope ? activeEventKey : 'unknown');
        const matchNumber = payload.matchNumber ?? entry.matchNumber ?? 'Unknown';
        const payloadTeamNumber = toNumber(payload.teamNumber);
        const teamNumber = payloadTeamNumber && payloadTeamNumber > 0 ? payloadTeamNumber : selectedTeam;

        const explicitCollectorId = sanitizeCollectorId(payload.scoutedByProfileId);
        const legacyAdminCollectorId = sanitizeCollectorId(payload.scoutedByAdminProfileId);
        const assignmentKey = `${eventKey}:${matchNumber}:${teamNumber}`;
        const assignmentCollectorId = assignmentCollectorByMatchKey.get(assignmentKey) || null;

        let collectorProfileId: string | null = null;
        let collectorSource: RawerMatchRecord['collectorSource'] = 'unknown';

        if (explicitCollectorId) {
          collectorProfileId = explicitCollectorId;
          collectorSource = 'record';
        } else if (legacyAdminCollectorId) {
          collectorProfileId = legacyAdminCollectorId;
          collectorSource = 'legacy-admin-record';
        } else if (assignmentCollectorId) {
          collectorProfileId = assignmentCollectorId;
          collectorSource = 'assignment';
        }

        const collectorName = collectorProfileId ? scoutNameById.get(collectorProfileId) || null : null;
        const autonPath = asAutonPathData(payload.autonPath);

        return {
          key: entry.key,
          source: entry.source,
          updatedAt: entry.updatedAt,
          eventKey,
          matchNumber,
          teamNumber,
          allianceColor: payload.allianceColor === 'Red' || payload.allianceColor === 'Blue' ? payload.allianceColor : '',
          collectorProfileId,
          collectorName,
          collectorSource,
          autonPath,
          autonTrajectoryPoints: autonPath?.trajectoryPoints || [],
          autonShotAttempts: autonPath?.shotAttempts || [],
          teleopShotAttempts: toPointList(payload.teleopShotAttempts),
          autonNotes: normalizeNoteText(payload.autonNotes),
          defenseNotes: normalizeNoteText(payload.defenseNotes),
          notes: normalizeNoteText(payload.notes),
        } as RawerMatchRecord;
      })
      .filter((record): record is RawerMatchRecord => record !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [activeEventKey, assignmentCollectorByMatchKey, isGlobalScope, scoutNameById, selectedTeam, selectedTeamMatchEntries]);

  return {
    rawerMatchRecords,
    isLoadingCollectorFallback,
    collectorFallbackError,
  };
}
