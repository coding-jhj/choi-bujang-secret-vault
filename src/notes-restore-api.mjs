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

// UUIDs are compared case-insensitively: Postgres returns uuid columns in lowercase, while a
// verified principal's userId (the judge's `sub` passes a case-insensitive regex) or the URL id
// may arrive in another case. A plain `!==` would call the same uuid two different owners.
const sameUuid = (left, right) => typeof left === 'string' && typeof right === 'string'
  && UUID.test(left) && UUID.test(right) && left.toLowerCase() === right.toLowerCase();

// The three values a restore must agree on: note id, owner, and sha256 of the content.
// `expected` comes from the backup row; `actual` is either the request (before the write) or the
// row the database returned from the write (after it). Only all three equal counts as a match.
function sameRecord(expected, actual) {
  return sameUuid(expected.id, actual.id) && sameUuid(expected.ownerId, actual.ownerId)
    && typeof actual.contentSha256 === 'string'
    && expected.contentSha256.toLowerCase() === actual.contentSha256.toLowerCase();
}

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
        if (liveOwner !== null && !sameUuid(liveOwner, user.userId)) { send(response, 404, { error: 'NOT_FOUND' }); return; }
        // 3. Content hash check before any write: the backup's own hash must equal sha256(content).
        if (!backupIntact(backup)) { send(response, 409, { error: 'BACKUP_HASH_MISMATCH' }); return; }
        // 4. The three values must match the backup copy BEFORE the write, checked explicitly
        //    rather than trusted to the lookup's filters: the backup's source_note_id is the
        //    requested id, its owner_id is the verified user, and its hash is the content's hash.
        const copy = { id: backup.sourceNoteId, ownerId: backup.ownerId, contentSha256: backup.contentSha256 };
        if (!sameRecord(copy, { id, ownerId: user.userId, contentSha256: sha256(backup.content) })) {
          send(response, 409, { error: 'RESTORE_MISMATCH' });
          return;
        }
        // 5. Write exactly this one id, still owner-scoped.
        const input = { title: backup.title, body: backup.content };
        const row = liveOwner === null
          ? await store.insertNote(user.userId, id, input)
          : await store.updateNote(user.userId, id, input);
        if (!row) { send(response, 404, { error: 'NOT_FOUND' }); return; }
        // 6. Confirm what was ACTUALLY persisted: the row the database returned from the write
        //    (id, owner_id, content) must again match the copy on all three values. The answer is
        //    built from that persisted row, never from the backup values held in memory.
        const persisted = { id: row.id, ownerId: row.ownerId, contentSha256: typeof row.body === 'string' ? sha256(row.body) : null };
        const verified = sameRecord(copy, persisted);
        // 7. Audit: add ONE restore_audit row (who, which note, from which backup row, when).
        //    It only inserts; it never updates or deletes anything. The note write above has
        //    already committed, so a failed audit insert does not turn the answer into an error,
        //    but it is never reported as recorded: the response says audit "failed" and one
        //    server log line names the note id. A write that happened is audited even if step 6
        //    then refuses to call it a verified restore.
        let audit = 'recorded';
        try {
          await store.recordRestore(user.userId, id, backup.backupId);
        } catch {
          audit = 'failed';
          console.error(`restore_audit: insert failed for restored note ${id}`);
        }
        if (!verified) {
          console.error(`notes restore: persisted row does not match backup for note ${id}`);
          send(response, 502, { error: 'RESTORE_UNVERIFIED', audit });
          return;
        }
        send(response, 200, { id: row.id, title: row.title, body: row.body, ownerId: row.ownerId,
          contentSha256: persisted.contentSha256, restoredFrom: isoOrNull(backup.backedUpAt), audit });
      });
    },
  };
}

// The written row as the database returned it, owner included, so the API can compare all three
// restore values (id, owner, content hash) against the backup after the write.
const toWritten = row => ({ id: row.id, ownerId: row.owner_id, title: row.title, body: row.content });
const WRITTEN = 'id,owner_id,title,content';

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
      return toWritten(check(await client.from('notes').insert({ id, owner_id: ownerId, title, content: body })
        .select(WRITTEN).single()));
    },
    async updateNote(ownerId, id, { title, body }) {
      const row = check(await client.from('notes').update({ title, content: body })
        .eq('id', id).eq('owner_id', ownerId).select(WRITTEN).maybeSingle());
      return row ? toWritten(row) : null;
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
