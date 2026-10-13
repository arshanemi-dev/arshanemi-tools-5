import { runCalculationTask } from './calculationTasks';

// Inputs are patched per task so a filter change doesn't copy the entire
// dataset into the worker again. A single client dispatches one job at a time.
const inputs = new Map();
self.onmessage = async ({ data: { id, type, patch } }) => {
  const input = { ...inputs.get(type), ...patch };
  inputs.set(type, input);
  try {
    const result = await runCalculationTask(type, input);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error?.message || 'Calculation failed' });
  }
};
