import { useEffect } from 'react';

type UseUserProfilePollingParams = {
  signedInUserProfileId: string | null;
  refreshUserProfiles: () => Promise<void>;
};

export function useUserProfilePolling(params: UseUserProfilePollingParams) {
  const { signedInUserProfileId, refreshUserProfiles } = params;

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshUserProfiles();
    }, 15000);

    const onFocus = () => {
      void refreshUserProfiles();
    };

    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [signedInUserProfileId, refreshUserProfiles]);
}
