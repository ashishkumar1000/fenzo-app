/**
 * useJobTemplateCache — caches job details (with workflow templates) for
 * notification cards to display dynamic workflow steps (Story 4.5 dynamic).
 *
 * Given a list of job IDs, fetches details (once, cached) and provides a
 * lookup function mapping jobId → workflowTemplate.steps | null.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { jobService } from '../../services';
import type { WorkflowTemplateStep } from '../../services/resources/jobs';

interface CachedJob {
  steps: WorkflowTemplateStep[] | null;
  fetched: boolean;
  error?: string;
}

export function useJobTemplateCache(jobIds: string[]) {
  const cacheRef = useRef<Map<string, CachedJob>>(new Map());
  const [updateTrigger, setUpdateTrigger] = useState(0);

  useEffect(() => {
    const uniqueIds = Array.from(new Set(jobIds));
    const toFetch = uniqueIds.filter(id => !cacheRef.current.has(id));

    if (toFetch.length === 0) return;

    // Fetch jobs in parallel (max 10 at a time to avoid flooding).
    const batchSize = 10;
    const batches = Array.from({ length: Math.ceil(toFetch.length / batchSize) }, (_, i) =>
      toFetch.slice(i * batchSize, (i + 1) * batchSize),
    );

    (async () => {
      for (const batch of batches) {
        await Promise.allSettled(
          batch.map(async id => {
            if (cacheRef.current.has(id)) return;

            try {
              const job = await jobService.getById(id);
              const steps = job.workflowTemplate?.steps ?? null;
              cacheRef.current.set(id, { steps, fetched: true });
            } catch (err) {
              const errorMsg = String(err);
              console.warn(`Failed to fetch workflow template for job ${id}:`, errorMsg);
              cacheRef.current.set(id, {
                steps: null,
                fetched: true,
                error: errorMsg,
              });
            }
          }),
        );
        // Trigger re-render after each batch completes so templates display immediately.
        setUpdateTrigger(prev => prev + 1);
      }
    })();
  }, [jobIds]);

  const getTemplate = useCallback(
    (jobId: string): WorkflowTemplateStep[] | null => {
      return cacheRef.current.get(jobId)?.steps ?? null;
    },
    [],
  );

  return { getTemplate, updateTrigger };
}
