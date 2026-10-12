// Saves sent strictly one after another, in the order they were asked for —
// what a typed SKU cost goes through (lib/profitLoss/useSkuCosts.js). Two
// saves of the same cost can't overtake each other on the way to the hub, so
// the value that ends up stored is always the last one typed. Pure — no
// React, no fetch of its own.
//
//   send(job)  → a promise of { ok, status, ... } (it may also throw)
//   onSaved(job, res)
//   onFailed(job, res, { first, dropped }) — `res.thrown` when send threw
//
// A save the hub turns down for good (a 4xx: bad value, limit reached, access
// removed) is dropped — reported once and the queue moves on, so one cost the
// hub won't take can't hold up every cost after it. Anything else (the hub
// unreachable, a 5xx, the sign-in expired) is tried again after a growing
// pause, a few times; `push` / `retry` start the attempts over.

const RETRY_MS = 4000;
const MAX_RETRY_MS = 30000;
const MAX_ATTEMPTS = 5;
const RETRYABLE_4XX = new Set([401, 408, 429]);

const isForGood = (res) => res?.status >= 400 && res.status < 500 && !RETRYABLE_4XX.has(res.status);

export function createSaveQueue({ send, onSaved = () => {}, onFailed = () => {}, retryMs = RETRY_MS, maxRetryMs = MAX_RETRY_MS, maxAttempts = MAX_ATTEMPTS }) {
  const jobs = []; // jobs[0] is the one being sent while `sending`
  let sending = false;
  let timer = null;
  let attempts = 0;

  async function pump() {
    if (sending) return;
    sending = true;
    clearTimeout(timer);
    timer = null;
    try {
      while (jobs.length) {
        const job = jobs[0];
        let res;
        try {
          res = await send(job);
        } catch (thrown) {
          res = { ok: false, thrown };
        }
        if (res?.ok) {
          attempts = 0;
          jobs.shift();
          onSaved(job, res);
          continue;
        }
        if (isForGood(res)) {
          jobs.shift();
          onFailed(job, res, { first: true, dropped: true });
          continue;
        }
        attempts += 1;
        onFailed(job, res, { first: attempts === 1, dropped: false });
        if (attempts < maxAttempts) timer = setTimeout(pump, Math.min(retryMs * 2 ** (attempts - 1), maxRetryMs));
        return;
      }
    } finally {
      sending = false;
    }
  }

  return {
    // `job.key` (optional) names what the job saves: a newer job with the
    // same key replaces one still waiting — only the latest value of a cost
    // is worth sending. The job already on its way can't be replaced.
    push(job) {
      const from = sending ? 1 : 0;
      const at = job.key == null ? -1 : jobs.findIndex((j, i) => i >= from && j.key === job.key);
      if (at >= 0) jobs[at] = job; else jobs.push(job);
      attempts = 0;
      pump();
    },
    // Try what's waiting again now, with a fresh set of attempts.
    retry() {
      attempts = 0;
      pump();
    },
    // Drop the pending retry timer (the page is going away).
    cancelRetry() {
      clearTimeout(timer);
      timer = null;
    },
    get waiting() { return jobs.length; },
  };
}
