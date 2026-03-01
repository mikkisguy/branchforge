import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { settingsApi } from '@/lib/api/settings';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

interface SettingsContextType {
  signUpsEnabled: boolean;
  isLoading: boolean;
  isSaving: boolean;
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
  const [isSaving, setIsSaving] = useState(false);
  const { user } = useAuth();
  const toast = useToast();

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

    const previousValue = signUpsEnabled;

    setIsSaving(true);
    // Optimistically update the UI for immediate feedback
    setSignUpsEnabled(enabled);

    try {
      await settingsApi.updateSetting('sign_ups_enabled', enabled);
      toast.success(
        enabled ? 'Sign-ups have been enabled' : 'Sign-ups have been disabled',
        'Setting saved'
      );
    } catch (err) {
      // Revert to the previous value on error
      setSignUpsEnabled(previousValue);
      toast.error(
        'Failed to update setting. The original value has been restored.',
        'Error'
      );
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsContext.Provider value={{ signUpsEnabled, isLoading, isSaving, updateSignUpsSetting }}>
      {children}
    </SettingsContext.Provider>
  );
}
