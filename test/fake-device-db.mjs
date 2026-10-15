// Test helper (not a test file): a fake Supabase client holding only public.device_approvals,
// enough for the real createDeviceApprovalStore code path (upsert with ignoreDuplicates on
// (owner_id, device_id), select/eq/maybeSingle). The unique constraint is enforced like Postgres.
export function fakeDeviceDb({ fail = false } = {}) {
  const rows = [];
  let seq = 0;
  const calls = [];
  const client = {
    rows,
    calls,
    // Student's manual SQL Editor step, simulated: approve/revoke one (owner, session) row.
    setStatus(ownerId, sessionId, status) {
      const row = rows.find(r => r.owner_id === ownerId && r.device_id === sessionId);
      if (!row) throw new Error('no such row');
      row.status = status;
    },
    from(table) {
      if (table !== 'device_approvals') throw new Error(`unexpected table ${table}`);
      let op = 'select'; let payload; let options; let cols = null;
      const filters = [];
      const exec = mode => {
        calls.push({ op, payload, options, filters: [...filters] });
        if (fail) return { data: null, error: { message: 'down' } };
        if (op === 'upsert') {
          const keys = options?.onConflict?.split(',') ?? [];
          const clash = rows.find(r => keys.every(k => r[k] === payload[k]));
          if (clash && !options?.ignoreDuplicates) Object.assign(clash, payload);
          if (!clash) rows.push({ id: `20000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, ...payload });
          return { data: null, error: null };
        }
        const hit = rows.filter(r => filters.every(([k, v]) => r[k] === v))
          .map(r => (cols ? Object.fromEntries(cols.split(',').map(c => [c, r[c]])) : { ...r }));
        if (mode === 'maybe') return hit.length > 1 ? { data: null, error: { message: 'many' } } : { data: hit[0] ?? null, error: null };
        return { data: hit, error: null };
      };
      const q = {
        select(c) { cols = c; return q; },
        upsert(p, o) { op = 'upsert'; payload = { ...p }; options = o; return q; },
        eq(k, v) { filters.push([k, v]); return q; },
        maybeSingle: async () => exec('maybe'),
        then(resolve, reject) { return Promise.resolve(exec('many')).then(resolve, reject); },
      };
      return q;
    },
  };
  return client;
}
