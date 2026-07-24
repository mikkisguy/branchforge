/**
 * Character Edit Dialog — Avatar Upload Section
 */

import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AVATAR_MAX_SIZE_MB } from "@branchforge/shared";
import type { CharacterFormState } from "./CharacterEditDialog.utils";

export interface CharacterEditDialogAvatarSectionProps {
  form: CharacterFormState;
  handleAvatarSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAvatarRemove: () => void;
  isSaving: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export function CharacterEditDialogAvatarSection({
  form,
  handleAvatarSelect,
  handleAvatarRemove,
  isSaving,
  fileInputRef,
}: CharacterEditDialogAvatarSectionProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="edit-char-avatar" className="text-xs">
        Avatar Image
      </Label>
      <div className="flex items-center gap-4">
        <div className="relative size-20 flex-shrink-0">
          {form.avatarPreview || form.avatarUrl ? (
            <img
              src={form.avatarPreview || form.avatarUrl}
              alt="Avatar preview"
              className="w-full h-full rounded-full object-cover border-4"
              style={{ borderColor: form.color }}
            />
          ) : (
            <div
              className="w-full h-full rounded-full border-4 border-dashed flex items-center justify-center"
              style={{ borderColor: form.color }}
            >
              <Upload className="size-6 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <Input
            id="edit-char-avatar"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleAvatarSelect}
            disabled={isSaving}
            className="text-sm"
            ref={fileInputRef}
          />
          <p className="text-xs text-muted-foreground">
            PNG, JPEG, WebP, or GIF (max {AVATAR_MAX_SIZE_MB}MB)
          </p>
          {(form.avatarPreview || form.avatarUrl) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAvatarRemove}
              disabled={isSaving}
              className="text-destructive h-8 px-2 text-xs"
            >
              Remove Avatar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
