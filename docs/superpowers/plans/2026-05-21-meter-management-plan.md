# Meter Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full CRUD for meters plus a progression view showing which labels affect each meter across the visual novel.

**Architecture:** Follows the State Variables pattern — class-based service with project-ownership authz, Zod-validated routes, TanStack Query hook, and a master-detail dialog (left: meter list + CRUD, right: progression table). No schema changes needed — the `meters` table and labels JSONB fields already exist.

**Tech Stack:** Fastify + Drizzle ORM (backend), React + TanStack Query + shadcn/ui (frontend), Zod (validation), TypeScript (shared types).

---

### Task 1: Add Meter types to shared package

**Files:**
- Modify: `packages/shared/src/index.ts` (append after StateVariable interface ~line 121)

- [ ] **Step 1: Add Meter and progression types**

Insert after the `StateVariable` interface (after line 121):

```typescript
// ============================================================================
// Meter Configuration
// ============================================================================

/**
 * Meter for tracking relationship stats and character attributes.
 * Meters are numerical values that change based on player choices.
 */
export interface Meter {
  id: string;
  projectId: string;
  characterId: string | null;
  key: string;
  name: string;
  minValue: number;
  maxValue: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Summary of a label's effect on a specific meter.
 */
export interface MeterLabelEffect {
  labelId: string;
  labelTitle: string;
  routeKey: string | null;
  prerequisiteValue: number | null;
  effectDelta: number | null;
}

/**
 * Full progression data for a single meter across all labels.
 */
export interface MeterProgression {
  meterKey: string;
  meterName: string;
  minValue: number;
  maxValue: number;
  labels: MeterLabelEffect[];
}
```

- [ ] **Step 2: Rebuild shared package**

```bash
pnpm --filter @branchforge/shared build
```
Expected: Build succeeds, no type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat: add Meter, MeterProgression types to shared package"
```

---

### Task 2: Add meter validation schemas to backend

**Files:**
- Modify: `apps/backend/src/lib/validation.ts` (append after state variables schemas)

- [ ] **Step 1: Add meter schemas and type exports**

Insert after `stateVariableIdParamsSchema` in `apps/backend/src/lib/validation.ts`:

```typescript
// ============================================================================
// Meter Validation Schemas
// ============================================================================

/**
 * Meter key validation schema
 * Keys must start with lowercase letter, contain only [a-z0-9_]
 */
export const meterKeySchema = z
  .string()
  .min(1, "Meter key is required")
  .max(100, "Meter key is too long")
  .regex(
    /^[a-z][a-z0-9_]*$/,
    "Meter key must start with a letter and contain only lowercase letters, numbers, and underscores"
  );

/**
 * Create meter request validation
 */
export const createMeterSchema = z
  .object({
    key: meterKeySchema,
    name: requiredString(200, "Name is too long"),
    characterId: uuidSchema.optional().nullable(),
    minValue: z.number().int().default(0),
    maxValue: z.number().int().default(100),
    description: optionalString(500, "Description is too long"),
  })
  .strict()
  .refine((data) => data.minValue <= data.maxValue, {
    message: "Minimum value must be less than or equal to maximum value",
    path: ["minValue"],
  });

/**
 * Update meter request validation
 */
export const updateMeterSchema = z
  .object({
    name: requiredString(200, "Name is too long").optional(),
    characterId: uuidSchema.optional().nullable(),
    minValue: z.number().int().optional(),
    maxValue: z.number().int().optional(),
    description: optionalString(500, "Description is too long"),
  })
  .strict()
  .partial()
  .refine(
    (data) => {
      if (data.minValue !== undefined && data.maxValue !== undefined) {
        return data.minValue <= data.maxValue;
      }
      return true;
    },
    {
      message: "Minimum value must be less than or equal to maximum value",
    }
  );

/**
 * Meter ID params validation
 */
export const meterIdParamsSchema = z.object({
  meterId: uuidSchema,
});

// Type exports
export type CreateMeterInput = z.infer<typeof createMeterSchema>;
export type UpdateMeterInput = z.infer<typeof updateMeterSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/lib/validation.ts
git commit -m "feat: add meter validation schemas"
```

---

### Task 3: Create MetersService

**Files:**
- Create: `apps/backend/src/services/meters.service.ts`

- [ ] **Step 1: Write the full service**

Create `apps/backend/src/services/meters.service.ts`:

```typescript
/**
 * Meters Service
 *
 * Handles meter CRUD operations and progression queries.
 * Meters are numerical relationship stats (affection, trust, etc.)
 * that change based on player choices across visual novel scenes.
 */

import { getDb } from "../db/index.js";
import { meters, labels } from "../db/schema/index.js";
import { eq, and, isNull } from "drizzle-orm";
import type { Meter, NewMeter } from "../db/schema/index.js";
import {
  ConflictError,
  NotFoundError,
} from "../middleware/error-handler.middleware.js";
import { requireProjectOwnership } from "./authz.service.js";
import type { MeterLabelEffect, MeterProgression } from "@branchforge/shared";

// ============================================================================
// Public Types
// ============================================================================

export interface PublicMeter {
  id: string;
  projectId: string;
  characterId: string | null;
  key: string;
  name: string;
  minValue: number;
  maxValue: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMeterBody {
  key: string;
  name: string;
  characterId?: string | null;
  minValue?: number;
  maxValue?: number;
  description?: string;
}

export interface UpdateMeterBody {
  name?: string;
  characterId?: string | null;
  minValue?: number;
  maxValue?: number;
  description?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function mapToPublicMeter(meter: Meter): PublicMeter {
  return {
    id: meter.id,
    projectId: meter.projectId,
    characterId: meter.characterId,
    key: meter.key,
    name: meter.name,
    minValue: meter.minValue,
    maxValue: meter.maxValue,
    description: meter.description,
    createdAt: meter.createdAt.toISOString(),
    updatedAt: meter.updatedAt.toISOString(),
  };
}

// ============================================================================
// MetersService
// ============================================================================

export class MetersService {
  // --------------------------------------------------------------------------
  // Authorization helper
  // --------------------------------------------------------------------------

  async requireMeterAccess(
    meterId: string,
    userId: string
  ): Promise<Meter> {
    const db = getDb();

    const [meter] = await db
      .select()
      .from(meters)
      .where(eq(meters.id, meterId))
      .limit(1);

    if (!meter) {
      throw new NotFoundError("Meter");
    }

    await requireProjectOwnership(meter.projectId, userId);

    return meter;
  }

  // --------------------------------------------------------------------------
  // CRUD
  // --------------------------------------------------------------------------

  /** List all meters for a project. */
  async listMeters(
    projectId: string,
    userId: string
  ): Promise<PublicMeter[]> {
    await requireProjectOwnership(projectId, userId);

    const db = getDb();

    const rows = await db
      .select()
      .from(meters)
      .where(eq(meters.projectId, projectId))
      .orderBy(meters.key);

    return rows.map(mapToPublicMeter);
  }

  /** Create a new meter. */
  async createMeter(
    projectId: string,
    userId: string,
    input: CreateMeterBody
  ): Promise<PublicMeter> {
    await requireProjectOwnership(projectId, userId);

    const db = getDb();

    const newMeter: NewMeter = {
      projectId,
      characterId: input.characterId ?? null,
      key: input.key,
      name: input.name,
      minValue: input.minValue ?? 0,
      maxValue: input.maxValue ?? 100,
      description: input.description ?? null,
    };

    try {
      const [result] = await db
        .insert(meters)
        .values(newMeter)
        .onConflictDoNothing({
          target: [meters.projectId, meters.key],
        })
        .returning();

      if (!result) {
        throw new ConflictError("Meter with this key already exists");
      }

      return mapToPublicMeter(result);
    } catch (err) {
      if (err instanceof ConflictError) throw err;
      if (
        err instanceof Error &&
        "code" in err &&
        err.code === "23505"
      ) {
        throw new ConflictError("Meter with this key already exists");
      }
      throw err;
    }
  }

  /** Update an existing meter. */
  async updateMeter(
    meterId: string,
    userId: string,
    input: UpdateMeterBody
  ): Promise<PublicMeter> {
    await this.requireMeterAccess(meterId, userId);

    const db = getDb();

    try {
      const [updated] = await db
        .update(meters)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(meters.id, meterId))
        .returning();

      if (!updated) {
        throw new NotFoundError("Meter");
      }

      return mapToPublicMeter(updated);
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      if (
        err instanceof Error &&
        "code" in err &&
        err.code === "23505"
      ) {
        throw new ConflictError("Meter with this key already exists");
      }
      throw err;
    }
  }

  /** Delete a meter. */
  async deleteMeter(
    meterId: string,
    userId: string
  ): Promise<void> {
    await this.requireMeterAccess(meterId, userId);

    const db = getDb();
    await db.delete(meters).where(eq(meters.id, meterId));
  }

  // --------------------------------------------------------------------------
  // Progression
  // --------------------------------------------------------------------------

  /**
   * Get progression data for all meters in a project.
   * Scans all active labels and extracts meter references from
   * prerequisites and effects JSONB fields.
   */
  async getProgression(
    projectId: string,
    userId: string
  ): Promise<MeterProgression[]> {
    await requireProjectOwnership(projectId, userId);

    const db = getDb();

    // Fetch all meters for the project
    const projectMeters = await db
      .select()
      .from(meters)
      .where(eq(meters.projectId, projectId))
      .orderBy(meters.key);

    if (projectMeters.length === 0) {
      return [];
    }

    // Fetch all active labels for this project
    const projectLabels = await db
      .select({
        id: labels.id,
        title: labels.title,
        route: labels.route,
        prerequisites: labels.prerequisites,
        effects: labels.effects,
      })
      .from(labels)
      .where(
        and(
          eq(labels.projectId, projectId),
          isNull(labels.deletedAt)
        )
      );

    // Build progression data for each meter
    return projectMeters.map((meter) => {
      const labelEffects: MeterLabelEffect[] = [];

      for (const label of projectLabels) {
        const prereqs = (label.prerequisites ?? {}) as {
          meters?: Record<string, number>;
        };
        const fx = (label.effects ?? {}) as {
          meters?: Record<string, number>;
        };

        const prerequisiteValue = prereqs.meters?.[meter.key] ?? null;
        const effectDelta = fx.meters?.[meter.key] ?? null;

        // Only include labels that actually reference this meter
        if (prerequisiteValue !== null || effectDelta !== null) {
          labelEffects.push({
            labelId: label.id,
            labelTitle: label.title,
            routeKey: label.route ?? null,
            prerequisiteValue,
            effectDelta,
          });
        }
      }

      return {
        meterKey: meter.key,
        meterName: meter.name,
        minValue: meter.minValue,
        maxValue: meter.maxValue,
        labels: labelEffects,
      };
    });
  }
}

export const metersService = new MetersService();
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/services/meters.service.ts
git commit -m "feat: add MetersService with CRUD and progression"
```

---

### Task 4: Create meters routes

**Files:**
- Create: `apps/backend/src/routes/meters.routes.ts`

- [ ] **Step 1: Write the full routes file**

Create `apps/backend/src/routes/meters.routes.ts`:

```typescript
/**
 * Meters Routes
 *
 * Thin HTTP wrappers that delegate all business logic to metersService.
 * Handles only request parsing and response mapping.
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateParams,
  validateBody,
} from "../middleware/validation.middleware.js";
import {
  createMeterSchema,
  updateMeterSchema,
  meterIdParamsSchema,
  projectIdParamsSchema,
  type CreateMeterInput,
  type UpdateMeterInput,
} from "../lib/validation.js";
import { metersService } from "../services/meters.service.js";

// ============================================================================
// Types
// ============================================================================

interface ProjectParams {
  projectId: string;
}

interface MeterParams {
  meterId: string;
}

// ============================================================================
// Route Handlers
// ============================================================================

/** GET /projects/:projectId/meters */
async function listMetersHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const result = await metersService.listMeters(
    projectId,
    request.user!.id
  );
  reply.status(200).send({ meters: result });
}

/** POST /projects/:projectId/meters */
async function createMeterHandler(
  request: FastifyRequest<{
    Params: ProjectParams;
    Body: CreateMeterInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const meter = await metersService.createMeter(
    projectId,
    request.user!.id,
    request.body
  );
  reply.status(201).send({ meter });
}

/** PUT /meters/:meterId */
async function updateMeterHandler(
  request: FastifyRequest<{
    Params: MeterParams;
    Body: UpdateMeterInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { meterId } = request.params;
  const meter = await metersService.updateMeter(
    meterId,
    request.user!.id,
    request.body
  );
  reply.status(200).send({ meter });
}

/** DELETE /meters/:meterId */
async function deleteMeterHandler(
  request: FastifyRequest<{ Params: MeterParams }>,
  reply: FastifyReply
): Promise<void> {
  const { meterId } = request.params;
  await metersService.deleteMeter(meterId, request.user!.id);
  reply.status(204).send();
}

/** GET /projects/:projectId/meters/progression */
async function getProgressionHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const result = await metersService.getProgression(
    projectId,
    request.user!.id
  );
  reply.status(200).send({ progression: result });
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function metersRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // All routes require authentication

  // List meters for project
  fastify.get<{ Params: ProjectParams }>(
    "/projects/:projectId/meters",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    listMetersHandler
  );

  // Create meter
  fastify.post<{ Params: ProjectParams; Body: CreateMeterInput }>(
    "/projects/:projectId/meters",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(projectIdParamsSchema),
        validateBody(createMeterSchema),
      ],
    },
    createMeterHandler
  );

  // Get progression for all meters
  fastify.get<{ Params: ProjectParams }>(
    "/projects/:projectId/meters/progression",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    getProgressionHandler
  );

  // Update meter
  fastify.put<{ Params: MeterParams; Body: UpdateMeterInput }>(
    "/meters/:meterId",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(meterIdParamsSchema),
        validateBody(updateMeterSchema),
      ],
    },
    updateMeterHandler
  );

  // Delete meter
  fastify.delete<{ Params: MeterParams }>(
    "/meters/:meterId",
    {
      onRequest: authenticate,
      preValidation: validateParams(meterIdParamsSchema),
    },
    deleteMeterHandler
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/routes/meters.routes.ts
git commit -m "feat: add meters routes (CRUD + progression)"
```

---

### Task 5: Register meters routes in server

**Files:**
- Modify: `apps/backend/src/index.ts`

- [ ] **Step 1: Import and register meters routes**

Add the import near the other route imports (after `stateVariablesRoutes` import, ~line 30 area):

```typescript
import { metersRoutes } from "./routes/meters.routes.js";
```

Add the registration after `stateVariablesRoutes` registration (~line 110 area):

```typescript
await server.register(metersRoutes, { prefix: basePath });
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/index.ts
git commit -m "feat: register meters routes in server"
```

---

### Task 6: Add meterKeys to query-keys

**Files:**
- Modify: `apps/frontend/src/lib/query-keys.ts` (append after `stateVariableKeys`)

- [ ] **Step 1: Add meterKeys**

Insert after `stateVariableKeys` (after line 128):

```typescript
// ============================================================================
// Meter Keys
// ============================================================================

export const meterKeys = {
  all: ["meters"] as const,
  lists: (projectId: string) => ["meters", projectId, "list"] as const,
  detail: (meterId: string) => ["meters", "detail", meterId] as const,
  progression: (projectId: string) =>
    ["meters", projectId, "progression"] as const,
} as const;
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/lib/query-keys.ts
git commit -m "feat: add meterKeys to query-keys"
```

---

### Task 7: Create meters API client

**Files:**
- Create: `apps/frontend/src/lib/api/meters.ts`

- [ ] **Step 1: Write the API client**

Create `apps/frontend/src/lib/api/meters.ts`:

```typescript
/**
 * Meters API Client
 *
 * Client for meter management operations.
 */

import { request, requestVoid } from "./client";
import type { Meter, MeterProgression } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

export interface CreateMeterBody {
  key: string;
  name: string;
  characterId?: string | null;
  minValue?: number;
  maxValue?: number;
  description?: string;
}

export interface UpdateMeterBody {
  name?: string;
  characterId?: string | null;
  minValue?: number;
  maxValue?: number;
  description?: string;
}

export interface ListMetersResponse {
  meters: Meter[];
}

export interface GetMeterResponse {
  meter: Meter;
}

export interface GetProgressionResponse {
  progression: MeterProgression[];
}

// ============================================================================
// Meters API
// ============================================================================

export const metersApi = {
  /** List all meters for a project */
  async listMeters(projectId: string): Promise<Meter[]> {
    const response = await request<ListMetersResponse>(
      `/projects/${encodeURIComponent(projectId)}/meters`,
      { method: "GET" }
    );
    return response.meters;
  },

  /** Create a new meter */
  async createMeter(
    projectId: string,
    body: CreateMeterBody
  ): Promise<Meter> {
    const response = await request<GetMeterResponse>(
      `/projects/${encodeURIComponent(projectId)}/meters`,
      { method: "POST", body: JSON.stringify(body) }
    );
    return response.meter;
  },

  /** Update an existing meter */
  async updateMeter(
    meterId: string,
    body: UpdateMeterBody
  ): Promise<Meter> {
    const response = await request<GetMeterResponse>(
      `/meters/${encodeURIComponent(meterId)}`,
      { method: "PUT", body: JSON.stringify(body) }
    );
    return response.meter;
  },

  /** Delete a meter */
  async deleteMeter(meterId: string): Promise<void> {
    return requestVoid(`/meters/${encodeURIComponent(meterId)}`, {
      method: "DELETE",
    });
  },

  /** Get progression data for all meters */
  async getProgression(
    projectId: string
  ): Promise<MeterProgression[]> {
    const response = await request<GetProgressionResponse>(
      `/projects/${encodeURIComponent(projectId)}/meters/progression`,
      { method: "GET" }
    );
    return response.progression;
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/lib/api/meters.ts
git commit -m "feat: add meters API client"
```

---

### Task 8: Create useMeters hook

**Files:**
- Create: `apps/frontend/src/hooks/useMeters.ts`

- [ ] **Step 1: Write the hook**

Create `apps/frontend/src/hooks/useMeters.ts`:

```typescript
/**
 * useMeters Hook
 *
 * Provides meter state and operations using TanStack Query.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { metersApi } from "@/lib/api/meters";
import { meterKeys } from "@/lib/query-keys";
import { useToast } from "@/contexts/ToastContext";
import type { Meter, MeterProgression } from "@branchforge/shared";
import type {
  CreateMeterBody,
  UpdateMeterBody,
} from "@/lib/api/meters";

// ============================================================================
// Types
// ============================================================================

export interface UseMetersReturn {
  meters: Meter[];
  isLoadingMeters: boolean;
  metersError: Error | null;

  progression: MeterProgression[];
  isLoadingProgression: boolean;
  progressionError: Error | null;

  isCreatingMeter: boolean;
  isUpdatingMeter: boolean;
  isDeletingMeter: boolean;

  refreshMeters: () => Promise<unknown>;
  refreshProgression: () => Promise<unknown>;
  createMeter: (input: CreateMeterBody) => Promise<Meter>;
  updateMeter: (
    meterId: string,
    input: UpdateMeterBody
  ) => Promise<Meter>;
  deleteMeter: (meterId: string) => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

export function useMeters(projectId: string): UseMetersReturn {
  const queryClient = useQueryClient();
  const toast = useToast();

  // Query for meters
  const {
    data: meters = [],
    isLoading: isLoadingMeters,
    error: metersError,
    refetch: refreshMeters,
  } = useQuery({
    queryKey: meterKeys.lists(projectId),
    queryFn: async () => metersApi.listMeters(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  // Query for progression
  const {
    data: progression = [],
    isLoading: isLoadingProgression,
    error: progressionError,
    refetch: refreshProgression,
  } = useQuery({
    queryKey: meterKeys.progression(projectId),
    queryFn: async () => metersApi.getProgression(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  // Create meter mutation
  const createMeterMutation = useMutation({
    mutationFn: async (input: CreateMeterBody) =>
      metersApi.createMeter(projectId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: meterKeys.lists(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: meterKeys.progression(projectId),
      });
      toast.success("Meter created successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create meter: ${error.message}`, "Error");
    },
  });

  // Update meter mutation
  const updateMeterMutation = useMutation({
    mutationFn: async ({
      meterId,
      input,
    }: {
      meterId: string;
      input: UpdateMeterBody;
    }) => metersApi.updateMeter(meterId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: meterKeys.lists(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: meterKeys.progression(projectId),
      });
      toast.success("Meter updated successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update meter: ${error.message}`, "Error");
    },
  });

  // Delete meter mutation
  const deleteMeterMutation = useMutation({
    mutationFn: async (meterId: string) =>
      metersApi.deleteMeter(meterId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: meterKeys.lists(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: meterKeys.progression(projectId),
      });
      toast.success("Meter deleted successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete meter: ${error.message}`, "Error");
    },
  });

  return {
    meters,
    isLoadingMeters,
    metersError: metersError as Error | null,
    progression,
    isLoadingProgression,
    progressionError: progressionError as Error | null,
    isCreatingMeter: createMeterMutation.isPending,
    isUpdatingMeter: updateMeterMutation.isPending,
    isDeletingMeter: deleteMeterMutation.isPending,
    refreshMeters,
    refreshProgression,
    createMeter: (input) => createMeterMutation.mutateAsync(input),
    updateMeter: (meterId, input) =>
      updateMeterMutation.mutateAsync({ meterId, input }),
    deleteMeter: (meterId) =>
      deleteMeterMutation.mutateAsync(meterId),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/hooks/useMeters.ts
git commit -m "feat: add useMeters hook"
```

---

### Task 9: Create MeterProgression component

**Files:**
- Create: `apps/frontend/src/components/MeterProgression.tsx`

- [ ] **Step 1: Write the progression component**

Create `apps/frontend/src/components/MeterProgression.tsx`:

```typescript
/**
 * Meter Progression View
 *
 * Shows all labels that affect a selected meter, including prerequisite
 * thresholds and effect deltas. This helps authors understand where and
 * how meter values change across the visual novel.
 */

import { Loader2 } from "lucide-react";
import type {
  MeterProgression as MeterProgressionType,
} from "@branchforge/shared";

interface MeterProgressionProps {
  progression: MeterProgressionType | null;
  isLoading: boolean;
  error: Error | null;
}

export function MeterProgression({
  progression,
  isLoading,
  error,
}: MeterProgressionProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-destructive mb-2">
          Failed to load progression data
        </p>
        <p className="text-xs text-muted-foreground">
          {error.message}
        </p>
      </div>
    );
  }

  if (!progression) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">
          Select a meter to see its progression
        </p>
      </div>
    );
  }

  if (progression.labels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground mb-1">
          No labels reference this meter yet
        </p>
        <p className="text-xs text-muted-foreground">
          Label prerequisites and effects using &quot;{progression.meterKey}&quot; will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">
          {progression.meterName}
        </h3>
        <p className="text-xs text-muted-foreground">
          Range: {progression.minValue}–{progression.maxValue}
          {" · "}
          {progression.labels.length} label
          {progression.labels.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="border border-border/30 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="border-b border-border/30">
              <th className="text-left p-3 font-medium text-muted-foreground">
                Label
              </th>
              <th className="text-left p-3 font-medium text-muted-foreground">
                Route
              </th>
              <th className="text-center p-3 font-medium text-muted-foreground">
                Prerequisite
              </th>
              <th className="text-center p-3 font-medium text-muted-foreground">
                Effect
              </th>
            </tr>
          </thead>
          <tbody>
            {progression.labels.map((le) => (
              <tr
                key={le.labelId}
                className="border-b border-border/20 last:border-b-0 hover:bg-muted/30"
              >
                <td className="p-3">{le.labelTitle}</td>
                <td className="p-3">
                  {le.routeKey ? (
                    <span className="text-xs px-2 py-0.5 rounded bg-muted font-mono">
                      {le.routeKey}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Shared
                    </span>
                  )}
                </td>
                <td className="p-3 text-center">
                  {le.prerequisiteValue !== null ? (
                    <span className="font-mono text-xs">
                      ≥ {le.prerequisiteValue}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="p-3 text-center">
                  {le.effectDelta !== null ? (
                    <span
                      className={`font-mono text-xs ${
                        le.effectDelta > 0
                          ? "text-green-600 dark:text-green-400"
                          : le.effectDelta < 0
                            ? "text-red-600 dark:text-red-400"
                            : "text-muted-foreground"
                      }`}
                    >
                      {le.effectDelta > 0 ? "+" : ""}
                      {le.effectDelta}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/components/MeterProgression.tsx
git commit -m "feat: add MeterProgression component"
```

---

### Task 10: Create MetersContent component

**Files:**
- Create: `apps/frontend/src/components/MetersContent.tsx`

- [ ] **Step 1: Write the content component**

Create `apps/frontend/src/components/MetersContent.tsx`:

```typescript
/**
 * Meters Content
 *
 * Reusable content component for meter management.
 * Supports inline create/edit/delete with validation.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Loader2, Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineMessage } from "@/components/ui/inline-error";
import { useMeters } from "@/hooks/useMeters";
import { useToast } from "@/contexts/ToastContext";

interface MetersContentProps {
  projectId: string;
}

interface MeterForm {
  id?: string;
  key: string;
  name: string;
  minValue: number;
  maxValue: number;
  description: string;
}

// ============================================================================
// Helpers
// ============================================================================

function validateMeter(meter: MeterForm): string | null {
  if (!meter.key.trim()) {
    return "Meter key is required";
  }
  if (!/^[a-z][a-z0-9_]*$/.test(meter.key)) {
    return "Key must start with a letter and contain only lowercase letters, numbers, and underscores";
  }
  if (meter.key.length > 100) {
    return "Key is too long (max 100 characters)";
  }
  if (!meter.name.trim()) {
    return "Name is required";
  }
  if (meter.name.length > 200) {
    return "Name is too long (max 200 characters)";
  }
  if (meter.minValue > meter.maxValue) {
    return "Minimum value must be less than or equal to maximum value";
  }
  return null;
}

// ============================================================================
// Component
// ============================================================================

export function MetersContent({ projectId }: MetersContentProps) {
  const {
    meters,
    isLoadingMeters,
    metersError,
    isCreatingMeter,
    isUpdatingMeter,
    isDeletingMeter,
    createMeter,
    updateMeter,
    deleteMeter,
  } = useMeters(projectId);
  const { error } = useToast();

  const [metersList, setMetersList] = useState<MeterForm[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const hasInitialized = useRef(false);

  const isSaving = isCreatingMeter || isUpdatingMeter || isDeletingMeter;

  // Initialize form state from server data
  useEffect(() => {
    if (isSaving || hasInitialized.current) return;

    if (meters.length > 0) {
      setMetersList(
        meters.map((m) => ({
          id: m.id,
          key: m.key,
          name: m.name,
          minValue: m.minValue,
          maxValue: m.maxValue,
          description: m.description ?? "",
        }))
      );
      hasInitialized.current = true;
    } else if (meters.length === 0) {
      setMetersList([]);
      hasInitialized.current = true;
    }
  }, [meters, isSaving]);

  const addMeter = useCallback(() => {
    const newIndex = metersList.length;
    setMetersList((prev) => [
      ...prev,
      { key: "", name: "", minValue: 0, maxValue: 100, description: "" },
    ]);
    setEditingIndex(newIndex);
  }, [metersList.length]);

  const updateField = useCallback(
    (index: number, field: keyof MeterForm, value: string | number) => {
      setMetersList((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
    },
    []
  );

  const removeMeter = useCallback(
    async (index: number) => {
      const meter = metersList[index];
      if (meter.id) {
        try {
          await deleteMeter(meter.id);
          setMetersList((prev) => prev.filter((_, i) => i !== index));
        } catch {
          // Error handled by hook toast
        }
      } else {
        setMetersList((prev) => prev.filter((_, i) => i !== index));
        if (editingIndex === index) setEditingIndex(null);
      }
    },
    [metersList, deleteMeter, editingIndex]
  );

  const saveMeter = useCallback(
    async (index: number) => {
      const meter = metersList[index];
      const validationError = validateMeter(meter);
      if (validationError) {
        error(validationError);
        return;
      }

      try {
        if (meter.id) {
          await updateMeter(meter.id, {
            name: meter.name,
            minValue: meter.minValue,
            maxValue: meter.maxValue,
            description: meter.description || undefined,
          });
        } else {
          await createMeter({
            key: meter.key,
            name: meter.name,
            minValue: meter.minValue,
            maxValue: meter.maxValue,
            description: meter.description || undefined,
          });
        }
        setEditingIndex(null);
      } catch {
        // Error handled by hook toast
      }
    },
    [metersList, createMeter, updateMeter, error]
  );

  const cancelEdit = useCallback(
    (index: number) => {
      const meter = metersList[index];
      if (!meter) return;

      if (!meter.id) {
        setMetersList((prev) => prev.filter((_, i) => i !== index));
      } else {
        const original = meters.find((m) => m.id === meter.id);
        if (!original) {
          setMetersList((prev) => prev.filter((_, i) => i !== index));
          setEditingIndex(null);
          return;
        }
        setMetersList((prev) => {
          const next = [...prev];
          next[index] = {
            id: original.id,
            key: original.key,
            name: original.name,
            minValue: original.minValue,
            maxValue: original.maxValue,
            description: original.description ?? "",
          };
          return next;
        });
      }
      setEditingIndex(null);
    },
    [metersList, meters]
  );

  const isMeterValid = useMemo(() => {
    return (index: number) => validateMeter(metersList[index]) === null;
  }, [metersList]);

  return (
    <div className="space-y-4">
      {isLoadingMeters ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : metersError ? (
        <InlineMessage variant="error">
          Failed to load meters
        </InlineMessage>
      ) : metersList.length === 0 ? (
        <div className="p-6 border border-dashed border-border/30 rounded-md text-center">
          <p className="text-sm text-muted-foreground mb-4">
            No meters defined yet. Add your first meter to start tracking
            relationship stats and character attributes.
          </p>
          <Button type="button" variant="outline" onClick={addMeter}>
            <Plus className="size-4 mr-2" />
            Add Meter
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {metersList.map((meter, index) => {
            const isEditing = editingIndex === index;
            const validationError = validateMeter(meter);

            return (
              <div
                key={meter.id || `new-${index}`}
                className="border border-border/30 rounded-md p-4 space-y-3"
              >
                {!isEditing ? (
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium font-mono text-sm truncate">
                          {meter.key || "(unnamed)"}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground shrink-0">
                          {meter.minValue}–{meter.maxValue}
                        </span>
                      </div>
                      <p className="text-sm truncate">
                        {meter.name}
                      </p>
                      {meter.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {meter.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingIndex(index)}
                        disabled={isSaving}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMeter(index)}
                        disabled={isSaving}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label
                          htmlFor={`meter-key-${index}`}
                          className="text-xs"
                        >
                          Key *
                        </Label>
                        <Input
                          id={`meter-key-${index}`}
                          type="text"
                          placeholder="affection_luna"
                          value={meter.key}
                          onChange={(e) =>
                            updateField(index, "key", e.target.value)
                          }
                          disabled={isSaving || !!meter.id}
                        />
                        <p className="text-xs text-muted-foreground">
                          {meter.id
                            ? "Key cannot be changed after creation"
                            : "Unique identifier (lowercase, underscores)"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label
                          htmlFor={`meter-name-${index}`}
                          className="text-xs"
                        >
                          Name *
                        </Label>
                        <Input
                          id={`meter-name-${index}`}
                          type="text"
                          placeholder="Luna Affection"
                          value={meter.name}
                          onChange={(e) =>
                            updateField(index, "name", e.target.value)
                          }
                          disabled={isSaving}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label
                          htmlFor={`meter-min-${index}`}
                          className="text-xs"
                        >
                          Min Value
                        </Label>
                        <Input
                          id={`meter-min-${index}`}
                          type="number"
                          value={meter.minValue}
                          onChange={(e) =>
                            updateField(
                              index,
                              "minValue",
                              parseInt(e.target.value) || 0
                            )
                          }
                          disabled={isSaving}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label
                          htmlFor={`meter-max-${index}`}
                          className="text-xs"
                        >
                          Max Value
                        </Label>
                        <Input
                          id={`meter-max-${index}`}
                          type="number"
                          value={meter.maxValue}
                          onChange={(e) =>
                            updateField(
                              index,
                              "maxValue",
                              parseInt(e.target.value) || 0
                            )
                          }
                          disabled={isSaving}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label
                        htmlFor={`meter-desc-${index}`}
                        className="text-xs"
                      >
                        Description
                      </Label>
                      <Input
                        id={`meter-desc-${index}`}
                        type="text"
                        placeholder="Tracks how much Luna trusts the player"
                        value={meter.description}
                        onChange={(e) =>
                          updateField(index, "description", e.target.value)
                        }
                        disabled={isSaving}
                      />
                    </div>

                    {validationError && (
                      <p className="text-xs text-destructive">
                        {validationError}
                      </p>
                    )}

                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => cancelEdit(index)}
                        disabled={isSaving}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => saveMeter(index)}
                        disabled={!isMeterValid(index) || isSaving}
                      >
                        {isSaving && (
                          <Loader2 className="size-4 animate-spin mr-2" />
                        )}
                        Save
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            onClick={addMeter}
            disabled={isSaving}
            className="w-full"
          >
            <Plus className="size-4 mr-2" />
            Add Another Meter
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/components/MetersContent.tsx
git commit -m "feat: add MetersContent component"
```

---

### Task 11: Create MetersDialog component

**Files:**
- Create: `apps/frontend/src/components/MetersDialog.tsx`

- [ ] **Step 1: Write the master-detail dialog**

Create `apps/frontend/src/components/MetersDialog.tsx`:

```typescript
/**
 * Meters Dialog
 *
 * Master-detail dialog for meter management:
 * - Left panel: list of meters with create/edit/delete
 * - Right panel: progression view for the selected meter
 */

import { useState } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MetersContent } from "./MetersContent";
import { MeterProgression } from "./MeterProgression";
import { useMeters } from "@/hooks/useMeters";

interface MetersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function MetersDialog({
  open,
  onOpenChange,
  projectId,
}: MetersDialogProps) {
  const [selectedMeterKey, setSelectedMeterKey] = useState<string | null>(
    null
  );

  const {
    meters,
    progression,
    isLoadingProgression,
    progressionError,
    refreshProgression,
  } = useMeters(projectId);

  // Reload progression when dialog opens or meters change
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      refreshProgression();
    }
    onOpenChange(isOpen);
  };

  const selectedProgression = selectedMeterKey
    ? progression.find((p) => p.meterKey === selectedMeterKey) ?? null
    : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl w-full max-h-[85vh] p-0 gap-0 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border/30 flex items-start justify-between shrink-0">
          <div>
            <h2 className="text-lg font-medium">Meter Management</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Define meters and see how they change across your visual novel.
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Body: two-column layout */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left panel: Meter list */}
          <div className="w-[340px] shrink-0 border-r border-border/30 overflow-y-auto p-6">
            <h3 className="text-sm font-medium mb-4">Meters</h3>
            <MetersContent projectId={projectId} />
          </div>

          {/* Right panel: Progression */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Meter selector tabs */}
            {meters.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {meters.map((meter) => (
                  <button
                    key={meter.id}
                    onClick={() => setSelectedMeterKey(meter.key)}
                    className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                      selectedMeterKey === meter.key
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted/80 text-foreground"
                    }`}
                  >
                    {meter.name}
                  </button>
                ))}
              </div>
            )}

            <MeterProgression
              progression={selectedProgression}
              isLoading={
                !selectedMeterKey ? false : isLoadingProgression
              }
              error={progressionError}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border/30 flex justify-end shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/components/MetersDialog.tsx
git commit -m "feat: add MetersDialog master-detail component"
```

---

### Task 12: Wire dialog into IDE

**Files:**
- Modify: `apps/frontend/src/pages/ide/index.tsx` (or whichever parent page renders the IDE)

**Note:** The exact location depends on how the IDE triggers dialogs. If there's a toolbar/menu that opens dialogs for state variables, characters, etc., add the MetersDialog trigger there.

- [ ] **Step 1: Locate where StateVariablesModal is rendered**

Find `StateVariablesModal` usage in the codebase:

```
src/components/ide-shared/StateVariablesModal.tsx
```

Search for where it's imported and used (likely `WriteMode.tsx` or `ScriptMode.tsx` or `HomePageIDE`).

- [ ] **Step 2: Add MetersDialog import and state**

In the same file where StateVariablesModal is used, add:

```typescript
import { MetersDialog } from "@/components/MetersDialog";
```

And add dialog state:

```typescript
const [metersDialogOpen, setMetersDialogOpen] = useState(false);
```

- [ ] **Step 3: Add trigger button and dialog**

Add a button and dialog alongside the existing state variables trigger:

```typescript
<Button
  variant="outline"
  size="sm"
  onClick={() => setMetersDialogOpen(true)}
>
  Meters
</Button>

<MetersDialog
  open={metersDialogOpen}
  onOpenChange={setMetersDialogOpen}
  projectId={projectId}
/>
```

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/ide/index.tsx
git commit -m "feat: wire MetersDialog into IDE toolbar"
```

---

### Task 13: Verify and test

**Files:**
- None (verification only)

- [ ] **Step 1: Rebuild shared package**

```bash
pnpm --filter @branchforge/shared build
```
Expected: Build succeeds.

- [ ] **Step 2: Type check backend**

```bash
cd apps/backend && pnpm typecheck
```
Expected: No type errors.

- [ ] **Step 3: Type check frontend**

```bash
cd apps/frontend && pnpm typecheck
```
Expected: No type errors.

- [ ] **Step 4: Run backend integration tests**

```bash
cd apps/backend && pnpm test:integration
```
Expected: All tests pass.

- [ ] **Step 5: Run frontend tests**

```bash
cd apps/frontend && pnpm test -- --run
```
Expected: All tests pass.

- [ ] **Step 6: Build full project**

```bash
pnpm build
```
Expected: Build succeeds.

- [ ] **Step 7: Commit any fixup changes**

```bash
git commit -am "fix: address type-check and test failures"
```
