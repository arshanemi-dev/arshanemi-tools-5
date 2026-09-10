'use client';

import { useEffect, useMemo, useState } from 'react';
import { Save, Search } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';

const ROLE_LABEL = { admin: 'Admin', user: 'User' };

// master_admin grants individual accounts access to the Profit & Loss Template
// Settings section here — a single boolean per user, backed by
// user_settings.marketplace_template_access on the hub. Ported from tools-4's
// listing TemplateAccessPanel.
export default function TemplateAccessPanel() {
  const { addToast } = useToast();
  const [users, setUsers] = useState(null);
  const [companies, setCompanies] = useState({});
  const [access, setAccess] = useState({}); // { [userId]: boolean }
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch('/api/admin/users').then((r) => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch('/api/admin/companies').then((r) => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch('/api/admin/marketplace-template-access').then((r) => { if (!r.ok) throw new Error(); return r.json(); }),
    ])
      .then(([usersData, companiesData, accessData]) => {
        if (!alive) return;
        setUsers(Array.isArray(usersData) ? usersData : usersData.users || []);
        const companyMap = {};
        (companiesData.companies || []).forEach((c) => { companyMap[c.id] = c.name; });
        setCompanies(companyMap);
        setAccess(accessData.access || {});
        setError(false);
        setLoading(false);
      })
      .catch(() => { if (alive) { setError(true); setLoading(false); } });
    return () => { alive = false; };
  }, [reloadKey]);

  const load = () => { setLoading(true); setReloadKey((k) => k + 1); };

  function toggle(userId) {
    setAccess((prev) => ({ ...prev, [userId]: !prev[userId] }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/marketplace-template-access', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(access),
      });
      if (res.status === 401) return;
      if (!res.ok) throw new Error('Failed to save');
      addToast('Saved', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  }

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
  }, [users, search]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="px-6 py-10 text-center text-sm text-subtle">
        Couldn’t load users.{' '}
        <button type="button" onClick={load} className="font-medium text-accent hover:underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-6 pb-24 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Template Access</h1>
          <p className="mt-0.5 text-sm text-subtle">
            Grant individual accounts access to build Profit &amp; Loss dashboard templates. master_admin always has access.
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users…"
            className="w-full rounded-lg bg-card-hover py-2 pl-9 pr-3 text-[13px] focus:outline-none focus:ring-1 focus:ring-accent-light"
          />
        </div>
      </div>

      <div className="divide-y divide-divider rounded-lg border border-divider bg-card">
        {filteredUsers.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-subtle">No users found.</div>
        )}
        {filteredUsers.map((u) => (
          <div key={u.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-foreground">{u.name}</p>
                <span className="inline-flex flex-shrink-0 items-center rounded-full bg-card-hover px-2 py-0.5 text-[11px] font-medium text-muted">
                  {ROLE_LABEL[u.role] || u.role}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-subtle">
                {u.email || u.mobile}
                {companies[u.company_id] ? ` · ${companies[u.company_id]}` : ''}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!!access[u.id]}
              onClick={() => toggle(u.id)}
              className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${access[u.id] ? 'bg-accent' : 'bg-divider-light'}`}
            >
              <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-card shadow transition-transform ${access[u.id] ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-10 flex items-center justify-end gap-3 border-t border-divider bg-card px-6 py-4 shadow-sm">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
