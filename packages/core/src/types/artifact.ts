// ArtifactRef — files touched or git refs produced during an agent run.
// Persisted in the artifacts table; surfaced in RunResult.artifacts.

import { z } from 'zod';

export const ArtifactRefSchema = z.object({
  kind: z.enum(['file', 'git-ref']),
  path: z.string().min(1),
  sha: z.string().optional(),
  summary: z.string().optional(),
});
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;
