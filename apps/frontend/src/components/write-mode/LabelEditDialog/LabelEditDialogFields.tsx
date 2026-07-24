/**
 * Label Edit Dialog - Form Fields
 *
 * Renders the title, label name, route/status/visibility grid, and duo pair
 * group fields for the label edit dialog.
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FormErrorMessage } from "@/components/ui/form-error-message";
import type { FormState, FormAction } from "./LabelEditDialogReducer";

export interface LabelEditDialogFieldsProps {
  form: FormState;
  dispatch: React.Dispatch<FormAction>;
  isSaving: boolean;
  currentLabelName: string | null;
  routeConfigs: Array<{ id: string; routeKey: string; routeName: string }>;
  pairGroups: Array<{
    id: string;
    characterAName: string;
    characterBName: string;
    duoEndingLabel: string;
  }>;
  duoEndingEnabled: boolean;
}

export function LabelEditDialogFields({
  form,
  dispatch,
  isSaving,
  currentLabelName,
  routeConfigs,
  pairGroups,
  duoEndingEnabled,
}: LabelEditDialogFieldsProps) {
  return (
    <>
      {/* Title Field */}
      <div className="space-y-1.5">
        <Label htmlFor="label-title" className="text-xs">
          Title *
        </Label>
        <Input
          id="label-title"
          type="text"
          value={form.title}
          onChange={(e) => {
            dispatch({ type: "SET_TITLE", value: e.target.value });
            if (form.titleError)
              dispatch({ type: "SET_TITLE_ERROR", value: "" });
          }}
          disabled={isSaving}
          placeholder="Enter label title"
          maxLength={255}
          aria-required="true"
          aria-invalid={!!form.titleError}
          aria-describedby={form.titleError ? "label-title-error" : undefined}
        />
        <FormErrorMessage id="label-title-error" message={form.titleError} />
      </div>

      {/* Label Name Field (only shown for file-backed labels) */}
      {currentLabelName !== null && (
        <div className="space-y-1.5">
          <Label htmlFor="label-name" className="text-xs">
            Label Name *
          </Label>
          <Input
            id="label-name"
            type="text"
            value={form.labelName}
            onChange={(e) => {
              dispatch({ type: "SET_LABEL_NAME", value: e.target.value });
              if (form.labelNameError)
                dispatch({ type: "SET_LABEL_NAME_ERROR", value: "" });
            }}
            disabled={isSaving}
            placeholder={currentLabelName}
            className="font-mono"
            aria-required="true"
            aria-invalid={!!form.labelNameError}
            aria-describedby={
              form.labelNameError ? "label-name-error" : undefined
            }
          />
          <FormErrorMessage
            id="label-name-error"
            message={form.labelNameError}
          />
          <p className="text-xs text-muted-foreground">
            Ren&apos;Py label identifier. Changing this updates the label
            definition in the .rpy file.
          </p>
        </div>
      )}

      {/* Route, Status, Visibility Grid */}
      <div className="grid grid-cols-3 max-sm:grid-cols-1 gap-3">
        {/* Route Field */}
        <div className="space-y-1.5">
          <Label htmlFor="label-route" className="text-xs">
            Route
          </Label>
          <Select
            id="label-route"
            value={form.route ?? ""}
            onChange={(value) => dispatch({ type: "SET_ROUTE", value })}
            disabled={isSaving}
            options={[
              { value: "", label: "No route (shared)" },
              ...routeConfigs.map((config) => ({
                value: config.routeKey,
                label: config.routeName,
              })),
            ]}
          />
        </div>

        {/* Status Field */}
        <div className="space-y-1.5">
          <Label htmlFor="label-status" className="text-xs">
            Status
          </Label>
          <Select
            id="label-status"
            value={form.status}
            onChange={(value) =>
              dispatch({
                type: "SET_STATUS",
                value: value as "DRAFT" | "REVIEW" | "FINAL",
              })
            }
            disabled={isSaving}
            options={[
              { value: "DRAFT", label: "DRAFT" },
              { value: "REVIEW", label: "REVIEW" },
              { value: "FINAL", label: "FINAL" },
            ]}
          />
        </div>

        {/* Visibility Field */}
        <div className="space-y-1.5">
          <Label htmlFor="label-visibility" className="text-xs">
            Visibility
          </Label>
          <Select
            id="label-visibility"
            value={form.visibility}
            onChange={(value) =>
              dispatch({
                type: "SET_VISIBILITY",
                value: value as "EXCLUSIVE" | "SHARED" | "DUO_PAIR",
              })
            }
            disabled={isSaving}
            options={[
              { value: "EXCLUSIVE", label: "EXCLUSIVE" },
              { value: "SHARED", label: "SHARED" },
              { value: "DUO_PAIR", label: "DUO_PAIR" },
            ]}
          />
        </div>
      </div>

      {/* Duo Pair Group (only shown when duo ending is enabled and pair groups exist) */}
      {duoEndingEnabled && pairGroups.length > 0 && (
        <div className="space-y-1.5">
          <Label
            htmlFor="label-duo-pair-id"
            className="text-sm font-medium text-foreground"
          >
            Duo Pair Group
          </Label>
          <Select
            id="label-duo-pair-id"
            value={form.duoPairId}
            onChange={(value) => dispatch({ type: "SET_DUO_PAIR_ID", value })}
            disabled={isSaving}
            options={[
              { value: "", label: "None" },
              ...pairGroups.map((pg) => ({
                value: pg.id,
                label: `${pg.characterAName} & ${pg.characterBName} — ${pg.duoEndingLabel}`,
              })),
            ]}
          />
        </div>
      )}
    </>
  );
}
