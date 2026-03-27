import { useEffect } from 'react';
import { UserProfile } from '../types';

type UseLoginProfileSelectionParams = {
  authMode: 'login' | 'signup';
  loginProfiles: UserProfile[];
  selectedLoginProfileId: string;
  setSelectedLoginProfileId: (profileId: string) => void;
};

export function useLoginProfileSelection(params: UseLoginProfileSelectionParams) {
  const { authMode, loginProfiles, selectedLoginProfileId, setSelectedLoginProfileId } = params;

  useEffect(() => {
    if (authMode !== 'login') {
      return;
    }
    if (loginProfiles.length === 0) {
      setSelectedLoginProfileId('');
      return;
    }
    if (!loginProfiles.some((profile) => profile.id === selectedLoginProfileId)) {
      setSelectedLoginProfileId(loginProfiles[0].id);
    }
  }, [authMode, loginProfiles, selectedLoginProfileId, setSelectedLoginProfileId]);
}
