import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from './verify-login.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const HEX64 = /^[0-9a-f]{64}$/iu;

function send(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  response.status(status).json(body);
}

const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');

// A backup is usable only if its stored hash is well formed and equals sha256(content).
// Anything else (wrong types, missing hash, tampered content) is treated as a mismatch.
function backupIntact(backup) {
  return typeof backup.title === 'string' && backup.title.trim() !== ''
    && typeof backup.content === 'string'
    && typeof backup.contentSha256 === 'string' && HEX64.test(backup.contentSha256)
    && sha256(backup.content) === backup.contentSha256.toLowerCase();
}

const isoOrNull = value => {
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
};

// POST /api/notes/:id/restore — restores ONE note of the verified user from notes_backup.
// verify(authorization) -> { userId } | null.  store holds all database access.
export function createNotesRestoreApi({ verify, store }) {
  async function guard(request, response, allowed) {
    let user = null;
    try { user = await verify(request.headers?.authorization); } catch { user = null; }
    if (!user) { send(response, 401, { error: 'LOGIN_REQUIRED' }); return null; }
    if (!allowed.includes(request.method)) {
      response.setHeader('Allow', allowed.join(', '));
      send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
      return null;
    }
    return user;
  }

  const run = async (response, work) => {
    try { await work(); } catch { send(response, 502, { error: 'NOTES_UNAVAILABLE' }); }
  };

  return {
    async item(request, response) {
      const user = await guard(request, response, ['POST']);
      if (!user) return;
      const id = request.query?.id;
      if (typeof id !== 'string' || !UUID.test(id)) { send(response, 404, { error: 'NOT_FOUND' }); return; }
      await run(response, async () => {
        // 1. Owner-scoped from the start: only a backup row whose owner_id is the verified user.
        const backup = await store.findBackup(user.userId, id);
        if (!backup) { send(response, 404, { error: 'NOT_FOUND' }); return; }
        // 2. The live note with this id, looked up WITHOUT the owner filter so a note owned by
        //    someone else is seen (and refused) instead of looking "missing" and being recreated.
        const liveOwner = await store.findNoteOwner(id);
        if (liveOwner !== null && liveOwner !== user.userId) { send(response, 404, { error: 'NOT_FOUND' }); return; }
        // 3. Content hash check before any write.
        if (!backupIntact(backup)) { send(response, 409, { error: 'BACKUP_HASH_MISMATCH' }); return; }
        // 4. Write exactly this one id, still owner-scoped.
        const input = { title: backup.title, body: backup.content };
        const note = liveOwner === null
          ? await store.insertNote(user.userId, id, input)
          : await store.updateNote(user.userId, id, input);
        if (!note) { send(response, 404, { error: 'NOT_FOUND' }); return; }
        // 5. Audit: add ONE restore_audit row (who, which note, from which backup row, when).
        //    It only inserts; it never updates or deletes anything. The note write above has
        //    already committed, so a failed audit insert does not turn the answer into an error,
        //    but it is never reported as recorded: the response says audit "failed" and one
        //    server log line names the note id.
        let audit = 'recorded';
        try {
          await store.recordRestore(user.userId, id, backup.backupId);
        } catch {
          audit = 'failed';
          console.error(`restore_audit: insert failed for restored note ${id}`);
        }
        send(response, 200, { ...note, restoredFrom: isoOrNull(backup.backedUpAt), audit });
      });
    },
  };
}

const toNote = row => ({ id: row.id, title: row.title, body: row.content });

// Restore is a two-step write, not `insert ... on conflict (id) do update`:
// an upsert's conflict branch would update the row by id alone, so a backup row pointing at
// another user's note id could overwrite that note. Here the update path always carries
// owner_id, and the insert path fails on a primary-key conflict (-> 502) instead of overwriting.
export function createSupabaseStore(client) {
  const check = ({ data, error }) => { if (error) throw new Error('db'); return data; };
  return {
    async findBackup(ownerId, noteId) {
      const row = check(await client.from('notes_backup')
        .select('id,source_note_id,owner_id,title,content,content_sha256,backed_up_at')
        .eq('source_note_id', noteId).eq('owner_id', ownerId)
        .order('backed_up_at', { ascending: false }).limit(1).maybeSingle());
      return row ? {
        backupId: row.id, sourceNoteId: row.source_note_id, ownerId: row.owner_id, title: row.title,
        content: row.content, contentSha256: row.content_sha256, backedUpAt: row.backed_up_at,
      } : null;
    },
    async findNoteOwner(id) {
      const row = check(await client.from('notes').select('owner_id').eq('id', id).maybeSingle());
      return row ? row.owner_id : null;
    },
    async insertNote(ownerId, id, { title, body }) {
      return toNote(check(await client.from('notes').insert({ id, owner_id: ownerId, title, content: body })
        .select('id,title,content').single()));
    },
    async updateNote(ownerId, id, { title, body }) {
      const row = check(await client.from('notes').update({ title, content: body })
        .eq('id', id).eq('owner_id', ownerId).select('id,title,content').maybeSingle());
      return row ? toNote(row) : null;
    },
    async recordRestore(ownerId, noteId, backupId) {
      check(await client.from('restore_audit')
        .insert({ note_id: noteId, owner_id: ownerId, restored_backup_id: backupId }));
    },
  };
}

// Built once per server instance from environment variables and aleph.config.json.
export function createRuntimeNotesRestoreApi(config, env = process.env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('SERVER_NOT_CONFIGURED');
  const verify = createLoginVerifier({ config, supabaseSecretKey: key });
  const client = createClient(url, key, { auth: { persistSession: false } });
  return createNotesRestoreApi({ verify, store: createSupabaseStore(client) });
}
