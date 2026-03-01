import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { settingsApi } from '@/lib/api/settings';
import { useAuth } from './AuthContext';

interface SettingsContextType {
  signUpsEnabled: boolean;
  isLoading: boolean;
  updateSignUpsSetting: (enabled: boolean) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
}

interface SettingsProviderProps {
  children: ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const [signUpsEnabled, setSignUpsEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  const refreshSettings = useCallback(async () => {
    try {
      const status = await settingsApi.getSignUpStatus();
      setSignUpsEnabled(status.enabled);
    } catch {
      // Fail open - if we can't fetch the setting, allow signups
      setSignUpsEnabled(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  const updateSignUpsSetting = async (enabled: boolean) => {
    if (user?.role !== 'OWNER') {
      throw new Error('Only administrators can change this setting');
    }
    await settingsApi.updateSetting('sign_ups_enabled', enabled);
    setSignUpsEnabled(enabled);
  };

  return (
    <SettingsContext.Provider value={{ signUpsEnabled, isLoading, updateSignUpsSetting }}>
      {children}
    </SettingsContext.Provider>
  );
}
