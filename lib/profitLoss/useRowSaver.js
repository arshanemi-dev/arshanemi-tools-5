'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ROWS_CHUNK, saveExtractedRowsPart } from './apiClient';
import { failureMessage } from './templatesApi';
import { buildExtractedRowsPayload } from './rowsPayload';
import { createRowLedger } from './rowLedger';

const SETTLE_MS = 800; // a multi-file upload changes the rows more than once — save after it settles
const RETRY_MS = [1500, 4000]; // pauses before trying a failed part a 2nd and a 3rd time

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// Automatic, unmetered per-row persistence for a signed-in user (the hub's
// profit_loss_extracted_rows — distinct from the coin-metered Save to
// History): whenever the dashboard's rows change, the ones not stored yet
// are saved IN PARTS of ROWS_CHUNK, one request after another, and `status`
// says how far along that is — what the upload progress window and the
// "saving…" line show.
//
//  - Only what is new or changed goes out (lib/profitLoss/rowLedger.js). An
//    upload used to send every row on screen again, the whole saved history
//    included.
//  - A part that fails is tried again twice; if it still fails the save
//    stops there (`status.phase === 'failed'`), the rows stay on screen, and
//    `retry()` — or the next change to the rows — picks up where it stopped.
//  - Rows that change while a save is running are picked up by another pass
//    as soon as the part in flight is done.
//  - Leaving the page mid-save asks first: the rest would be lost.
//
// `enabled` = signed in and something was uploaded this session; `rows` =
// the dashboard's canonical rows. → { status, retry, reset, markStored,
// forget }. `status` = null, or { phase: 'saving' | 'saved' | 'failed',
// saved, total, error }. `markStored(rows)` = rows that came from the hub;
// `forget()` = rows were deleted there. `reset()` clears a finished status.
export function useRowSaver({ enabled, rows, orderIdHeader, transactionIdHeader }) {
  const [status, setStatus] = useState(null);

  const ledgerRef = useRef(null);
  const ledger = useCallback(() => {
    if (!ledgerRef.current) ledgerRef.current = createRowLedger();
    return ledgerRef.current;
  }, []);

  const latest = useRef({ enabled, rows, orderIdHeader, transactionIdHeader });
  useEffect(() => { latest.current = { enabled, rows, orderIdHeader, transactionIdHeader }; });

  const running = useRef(false);
  const again = useRef(false); // the rows changed while a save was running
  const gone = useRef(false); // unmounted — stop between parts
  useEffect(() => {
    gone.current = false;
    return () => { gone.current = true; };
  }, []);

  const savePart = useCallback(async (part) => {
    let res = null;
    for (let attempt = 0; attempt <= RETRY_MS.length; attempt += 1) {
      if (attempt) await wait(RETRY_MS[attempt - 1]);
      res = await saveExtractedRowsPart(part.map((item) => item.entry));
      // A 4xx is the hub saying no (row limit reached, access removed) — asking again won't change it.
      if (res.ok || (res.status >= 400 && res.status < 500) || gone.current) break;
    }
    return res;
  }, []);

  const run = useCallback(async () => {
    if (running.current) { again.current = true; return; }
    running.current = true;
    try {
      do {
        again.current = false;
        const now = latest.current;
        if (!now.enabled) return;
        const items = ledger().pending(buildExtractedRowsPayload(now.rows, now.orderIdHeader, now.transactionIdHeader));
        let saved = 0;
        setStatus({ phase: items.length ? 'saving' : 'saved', saved, total: items.length, error: null });
        for (let i = 0; i < items.length; i += ROWS_CHUNK) {
          const part = items.slice(i, i + ROWS_CHUNK);
          const res = await savePart(part);
          if (gone.current) return;
          if (!res.ok) {
            setStatus({ phase: 'failed', saved, total: items.length, error: failureMessage(res, 'Could not save your rows') });
            return;
          }
          ledger().record(part);
          saved += part.length;
          setStatus({ phase: saved < items.length ? 'saving' : 'saved', saved, total: items.length, error: null });
          if (again.current) break; // the rows changed — work out afresh what is left
        }
      } while (again.current);
    } finally {
      running.current = false;
    }
  }, [ledger, savePart]);

  useEffect(() => {
    if (!enabled || !rows.length) return undefined;
    const timer = setTimeout(run, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [enabled, rows, orderIdHeader, transactionIdHeader, run]);

  const saving = status?.phase === 'saving';
  useEffect(() => {
    if (!saving) return undefined;
    const ask = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [saving]);

  const reset = useCallback(() => setStatus((cur) => (cur?.phase === 'saving' ? cur : null)), []);
  const markStored = useCallback((stored) => ledger().markStored(stored), [ledger]);
  const forget = useCallback((options) => ledger().forget(options), [ledger]);

  return { status, retry: run, reset, markStored, forget };
}
