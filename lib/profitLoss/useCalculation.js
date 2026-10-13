'use client';

import { useEffect, useState } from 'react';

export function useCalculation(client, type, input, initialValue, enabled = true) {
  const [completed, setCompleted] = useState({ input: null, value: initialValue, error: null });
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    client.run(type, input, { signal: controller.signal }).then(
      (value) => { if (!controller.signal.aborted) setCompleted({ input, value, error: null }); },
      (error) => {
        if (!controller.signal.aborted) setCompleted((previous) => ({ input, value: previous.value, error }));
      },
    );
    return () => controller.abort();
  }, [client, type, input, enabled]);
  return { ...completed, pending: !enabled || completed.input !== input };
}
