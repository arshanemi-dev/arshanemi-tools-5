const aborted = () => new DOMException('Calculation cancelled', 'AbortError');

// One worker per dashboard, with a bounded queue: aborted/superseded jobs
// are removed before their data is cloned. Existing results remain visible.
export function createCalculationClient({ createWorker = () => new Worker(new URL('./calculation.worker.js', import.meta.url), { type: 'module' }) } = {}) {
  let worker;
  let unavailable = false;
  let active = null;
  let sequence = 0;
  const queue = [];
  const sent = new Map();

  const finish = (job, error, result) => {
    job.signal?.removeEventListener('abort', job.cancel);
    if (error) job.reject(error);
    else job.resolve(result);
    if (active === job) active = null;
    pump();
  };

  const fallback = async (job) => {
    try {
      // Unsupported/blocked workers still work. Yield before the fallback so
      // loading feedback paints; this path is not claimed to be non-blocking.
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (job.cancelled || job.signal?.aborted) throw aborted();
      const { runCalculationTask } = await import('./calculationTasks');
      if (job.cancelled || job.signal?.aborted) throw aborted();
      const result = await runCalculationTask(job.type, job.input);
      finish(job, null, result);
    } catch (error) { finish(job, error); }
  };

  function pump() {
    if (active || !queue.length) return;
    const job = queue.shift();
    active = job;
    if (unavailable) { fallback(job); return; }
    try {
      if (!worker) {
        worker = createWorker();
        worker.onmessage = ({ data }) => {
          if (!active || active.id !== data.id) return;
          finish(active, data.error ? new Error(data.error) : null, data.result);
        };
        worker.onerror = (event) => {
          event.preventDefault?.();
          worker?.terminate();
          worker = null;
          sent.clear();
          unavailable = true;
          if (active) fallback(active);
        };
      }
      const previous = sent.get(job.type) || {};
      const patch = Object.fromEntries(Object.entries(job.input).filter(([key, value]) => previous[key] !== value));
      worker.postMessage({ id: job.id, type: job.type, patch });
      sent.set(job.type, job.input);
    } catch (error) {
      // Cloning invalid input is a real error, not a reason to retry work.
      if (error.name === 'DataCloneError') { finish(job, error); return; }
      worker?.terminate();
      worker = null;
      sent.clear();
      unavailable = true;
      fallback(job);
    }
  }

  return {
    run(type, input, { signal } = {}) {
      if (signal?.aborted) return Promise.reject(aborted());
      return new Promise((resolve, reject) => {
        const job = { id: ++sequence, type, input, signal, resolve, reject };
        job.cancel = () => {
          job.cancelled = true;
          const index = queue.indexOf(job);
          if (index !== -1) queue.splice(index, 1);
          signal?.removeEventListener('abort', job.cancel);
          reject(aborted());
        };
        signal?.addEventListener('abort', job.cancel, { once: true });
        queue.push(job);
        pump();
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      sent.clear();
      const jobs = [...queue, ...(active ? [active] : [])];
      queue.length = 0;
      active = null;
      for (const job of jobs) {
        job.cancelled = true;
        job.signal?.removeEventListener('abort', job.cancel);
        job.reject(aborted());
      }
    },
  };
}
