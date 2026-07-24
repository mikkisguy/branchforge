import { Switch } from "@/components/ui/switch";
import {
  SettingsRow,
  SettingsSection,
} from "@/components/ide-shared/SettingsLayout";

interface SettingsModalSystemTabProps {
  signUpsEnabled: boolean | undefined;
  onSignUpsChange: (enabled: boolean) => void;
  disabled: boolean;
}

export function SettingsModalSystemTab({
  signUpsEnabled,
  onSignUpsChange,
  disabled,
}: SettingsModalSystemTabProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">System Administration</h3>

      <SettingsSection title="User Registration">
        <SettingsRow
          label="Sign ups enabled"
          description="Allow new users to register"
        >
          <Switch
            checked={signUpsEnabled}
            onCheckedChange={onSignUpsChange}
            disabled={disabled}
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
