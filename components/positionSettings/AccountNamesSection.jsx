'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Building2, Edit2, Loader2, Plus, Tag, Trash2, X } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { authFetch } from '@/lib/tokenStore';

// ---------------------------------------------------------------------------
// Tiny API helpers — call the tool's own proxy routes.
// ---------------------------------------------------------------------------
async function apiFetch(path, opts = {}) {
  const res = await authFetch(path, opts);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const listCompanies = () => apiFetch('/api/profit-loss/companies');
const createCompany = (marketplace, brand) =>
  apiFetch('/api/profit-loss/companies', {
    method: 'POST',
    body: JSON.stringify({ marketplace, brand }),
  });
const updateCompany = (id, marketplace, brand) =>
  apiFetch(`/api/profit-loss/companies/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ marketplace, brand }),
  });
const deleteCompany = (id) =>
  apiFetch(`/api/profit-loss/companies/${encodeURIComponent(id)}`, { method: 'DELETE' });

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function companyLabel(marketplace, brand) {
  return `${marketplace}_${brand}`;
}

// Marketplace names come from the live templates the dashboard already loads.
// We receive them as `marketplaces` = [{ id, name }] from the parent.

// ---------------------------------------------------------------------------
// AddEditModal — used for both Create and Edit
// ---------------------------------------------------------------------------
function AddEditModal({ open, marketplaces = [], initial = null, saving, onSave, onCancel }) {
  const [marketplace, setMarketplace] = useState(initial?.marketplace || '');
  const [brand, setBrand] = useState(initial?.brand || '');
  const brandRef = useRef(null);

  // Reset whenever the modal opens with new data
  useEffect(() => {
    if (open) {
      setMarketplace(initial?.marketplace || (marketplaces[0]?.name ?? ''));
      setBrand(initial?.brand || '');
      setTimeout(() => brandRef.current?.focus(), 50);
    }
  }, [open, initial, marketplaces]);

  if (!open) return null;

  const isEdit = !!initial;
  const trimBrand = brand.trim();
  const trimMarket = marketplace.trim();
  const preview = trimMarket && trimBrand ? companyLabel(trimMarket, trimBrand) : '';
  const canSubmit = !saving && !!trimMarket && !!trimBrand;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-card w-full max-w-md mx-4 rounded-2xl shadow-2xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-accent/10 p-1.5 text-accent">
              <Building2 size={16} />
            </span>
            <h3 className="text-base font-semibold text-foreground">
              {isEdit ? 'Edit Account Name' : 'Add Account Name'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-subtle hover:text-muted"
            disabled={saving}
          >
            <X size={18} />
          </button>
        </div>

        {/* Marketplace selector */}
        <label className="block mb-4">
          <span className="block text-sm font-medium text-foreground mb-1.5">Marketplace</span>
          {marketplaces.length > 0 ? (
            <select
              value={marketplace}
              onChange={(e) => setMarketplace(e.target.value)}
              disabled={saving}
              className="w-full rounded-lg border border-divider-light bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
            >
              {marketplaces.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={marketplace}
              onChange={(e) => setMarketplace(e.target.value)}
              placeholder="e.g. Amazon"
              disabled={saving}
              maxLength={100}
              className="w-full rounded-lg border border-divider-light bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
            />
          )}
        </label>

        {/* Brand input */}
        <label className="block mb-4">
          <span className="block text-sm font-medium text-foreground mb-1.5">Brand</span>
          <input
            ref={brandRef}
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) onSave(marketplace.trim(), trimBrand); }}
            placeholder="e.g. MyBrand"
            disabled={saving}
            maxLength={100}
            className="w-full rounded-lg border border-divider-light bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
          />
        </label>

        {/* Preview */}
        {preview && (
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-dashed border-divider bg-surface px-3 py-2">
            <Tag size={13} className="shrink-0 text-subtle" />
            <span className="text-[13px] font-mono font-medium text-foreground">{preview}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-card border border-divider-light text-muted hover:bg-surface transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(marketplace.trim(), trimBrand)}
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-action hover:bg-action-hover text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {isEdit ? 'Save Changes' : 'Add Account'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AccountNamesSection — full CRUD for {Marketplace}_{Brand} accounts
// ---------------------------------------------------------------------------
// `marketplaces` = [{ id, name }] from useLiveTemplates (the live version's
//   marketplace list). Passed in so this component doesn't re-fetch them.
// ---------------------------------------------------------------------------
export default function AccountNamesSection({ marketplaces = [] }) {
  const { addToast } = useToast();

  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Modal state
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // company object being edited
  const [deleteTarget, setDeleteTarget] = useState(null); // company object being deleted

  // Saving / deleting spinners
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ------------------------------------------------------------------
  // Load
  // ------------------------------------------------------------------
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await listCompanies();
      if (!res.ok) throw new Error(res.data?.error || 'Failed to load accounts');
      setCompanies(res.data?.companies ?? []);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ------------------------------------------------------------------
  // Create
  // ------------------------------------------------------------------
  const handleCreate = async (marketplace, brand) => {
    setSaving(true);
    try {
      const res = await createCompany(marketplace, brand);
      if (!res.ok) {
        addToast(res.data?.error || 'Could not add account', 'error');
        return;
      }
      setCompanies((prev) => [...prev, res.data.company]);
      setShowAdd(false);
      addToast(`Account "${companyLabel(marketplace, brand)}" added`, 'success');
    } catch {
      addToast('Could not add account — please try again', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------------------------
  // Update
  // ------------------------------------------------------------------
  const handleUpdate = async (marketplace, brand) => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const res = await updateCompany(editTarget.id, marketplace, brand);
      if (!res.ok) {
        addToast(res.data?.error || 'Could not update account', 'error');
        return;
      }
      const updated = res.data.company;
      setCompanies((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditTarget(null);
      addToast(`Account renamed to "${updated.company}"`, 'success');
    } catch {
      addToast('Could not update account — please try again', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------------------------
  // Delete
  // ------------------------------------------------------------------
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await deleteCompany(deleteTarget.id);
      if (!res.ok) {
        addToast(res.data?.error || 'Could not delete account', 'error');
        return;
      }
      setCompanies((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      addToast(
        `"${deleteTarget.company}" deleted — all data linked to this account has been removed`,
        'success',
      );
      setDeleteTarget(null);
    } catch {
      addToast('Could not delete account — please try again', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-divider bg-background p-4">
      {/* Section header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="rounded-lg bg-accent/10 p-1.5 text-accent shrink-0">
            <Building2 size={15} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Account Names</h2>
            <p className="text-[12px] text-muted">
              Each account is named <span className="font-mono font-medium text-foreground">Marketplace_Brand</span>. Deleting an account also removes all its associated data.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-action/40 bg-action/5 px-3 py-1.5 text-[13px] font-medium text-action hover:bg-action/10 transition-colors"
        >
          <Plus size={14} />
          Add Account
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={22} className="animate-spin text-muted" />
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center gap-2 py-6">
          <p className="text-[13px] text-neg">{loadError}</p>
          <button
            type="button"
            onClick={load}
            className="text-[12px] font-medium text-link hover:underline"
          >
            Retry
          </button>
        </div>
      ) : companies.length === 0 ? (
        <p className="rounded-lg border border-dashed border-divider-light px-3 py-5 text-center text-[13px] text-muted">
          No accounts yet — click <strong>Add Account</strong> to create your first one.
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {companies.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-2 rounded-xl border border-divider-light bg-surface p-3 min-w-0"
            >
              {/* Top: icon + account name */}
              <div className="flex items-start gap-2 min-w-0">
                <span className="mt-0.5 rounded-md bg-accent/10 p-1 text-accent shrink-0">
                  <Tag size={12} />
                </span>
                <span
                  className="flex-1 min-w-0 font-mono text-[12px] font-semibold text-foreground break-all leading-snug"
                  title={c.company}
                >
                  {c.company}
                </span>
              </div>

              {/* Middle: marketplace · brand chips */}
              <div className="flex flex-wrap gap-1.5 px-0.5">
                <span className="inline-flex items-center rounded-full border border-divider-light bg-background px-2 py-0.5 text-[10px] font-medium text-subtle">
                  {c.marketplace}
                </span>
                <span className="inline-flex items-center rounded-full border border-divider-light bg-background px-2 py-0.5 text-[10px] font-medium text-subtle">
                  {c.brand}
                </span>
              </div>

              {/* Bottom: actions */}
              <div className="flex gap-1.5 mt-auto pt-1 border-t border-divider-light">
                <button
                  type="button"
                  onClick={() => setEditTarget(c)}
                  title={`Edit "${c.company}"`}
                  className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg py-1 text-[11px] font-medium text-muted border border-divider-light hover:bg-card-hover transition-colors"
                >
                  <Edit2 size={11} />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(c)}
                  title={`Delete "${c.company}"`}
                  className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg py-1 text-[11px] font-medium text-neg/80 border border-neg/20 hover:bg-neg/5 transition-colors"
                >
                  <Trash2 size={11} />
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Add modal */}
      <AddEditModal
        open={showAdd}
        marketplaces={marketplaces}
        initial={null}
        saving={saving}
        onSave={handleCreate}
        onCancel={() => { if (!saving) setShowAdd(false); }}
      />

      {/* Edit modal */}
      <AddEditModal
        open={!!editTarget}
        marketplaces={marketplaces}
        initial={editTarget}
        saving={saving}
        onSave={handleUpdate}
        onCancel={() => { if (!saving) setEditTarget(null); }}
      />

      {/* Delete confirmation — user must type the full account name */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.company}"?`}
        description={
          `All data linked to this account — uploaded rows, history snapshots, SKU costs — ` +
          `will be permanently deleted. This cannot be undone.`
        }
        confirmText={deleteTarget?.company}
        confirmLabel="Delete Account"
        loadingLabel="Deleting…"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => { if (!deleting) setDeleteTarget(null); }}
      />
    </section>
  );
}
