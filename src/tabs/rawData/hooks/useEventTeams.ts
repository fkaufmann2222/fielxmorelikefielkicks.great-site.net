import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { statbotics } from '../../../lib/statbotics';
import { getProfileTeams } from '../../../lib/competitionProfiles';
import { EventTeam } from '../types';
import { extractNickname, extractTeamNumber } from '../utils';

type UseEventTeamsArgs = {
  eventKey: string;
  profileId: string | null;
  embeddedTeamNumber: number | null;
};

type UseEventTeamsResult = {
  eventTeams: EventTeam[];
  selectedTeam: number | null;
  setSelectedTeam: Dispatch<SetStateAction<number | null>>;
  isLoadingTeams: boolean;
  teamsError: string | null;
};

export function useEventTeams({ eventKey, profileId, embeddedTeamNumber }: UseEventTeamsArgs): UseEventTeamsResult {
  const [eventTeams, setEventTeams] = useState<EventTeam[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);

  useEffect(() => {
    if (embeddedTeamNumber && Number.isInteger(embeddedTeamNumber) && embeddedTeamNumber > 0) {
      setSelectedTeam(embeddedTeamNumber);
    }
  }, [embeddedTeamNumber]);

  useEffect(() => {
    if (!eventKey) {
      setEventTeams([]);
      setSelectedTeam(null);
      setTeamsError('Select an event profile in Home to view teams.');
      return;
    }

    let cancelled = false;

    const loadTeams = async () => {
      setIsLoadingTeams(true);
      setTeamsError(null);

      try {
        const statboticsRows = await statbotics.fetchEventTeams(eventKey);
        const mapped = new Map<number, EventTeam>();

        if (Array.isArray(statboticsRows)) {
          statboticsRows.forEach((row) => {
            const teamNumber = extractTeamNumber(row as Record<string, unknown>);
            if (!teamNumber) {
              return;
            }

            mapped.set(teamNumber, {
              teamNumber,
              nickname: extractNickname(row as Record<string, unknown>, teamNumber),
              stats: row,
            });
          });
        }

        if (mapped.size === 0 && profileId) {
          const fallbackTeams = getProfileTeams(profileId);
          fallbackTeams.forEach((team) => {
            if (!team?.team_number) {
              return;
            }
            mapped.set(team.team_number, {
              teamNumber: team.team_number,
              nickname: team.nickname || team.name || `Team ${team.team_number}`,
              stats: null,
            });
          });
        }

        const list = Array.from(mapped.values()).sort((a, b) => a.teamNumber - b.teamNumber);

        if (!cancelled) {
          setEventTeams(list);
          if (list.length === 0) {
            setSelectedTeam(embeddedTeamNumber && embeddedTeamNumber > 0 ? embeddedTeamNumber : null);
            setTeamsError('No teams found for this event.');
          } else if (embeddedTeamNumber && embeddedTeamNumber > 0) {
            setSelectedTeam(embeddedTeamNumber);
          } else {
            setSelectedTeam((prev) => {
              if (prev && list.some((team) => team.teamNumber === prev)) {
                return prev;
              }
              return list[0].teamNumber;
            });
          }
        }
      } catch (error) {
        if (!cancelled) {
          setTeamsError(error instanceof Error ? error.message : 'Failed to load event teams');
          setEventTeams([]);
          setSelectedTeam(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTeams(false);
        }
      }
    };

    void loadTeams();

    return () => {
      cancelled = true;
    };
  }, [embeddedTeamNumber, eventKey, profileId]);

  return {
    eventTeams,
    selectedTeam,
    setSelectedTeam,
    isLoadingTeams,
    teamsError,
  };
}
