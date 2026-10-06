import { createClient } from '@supabase/supabase-js';

// 2단계: 아직 로그인 확인이 없는 공개 API입니다. 3단계에서 인증을 붙입니다.
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
    return;
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from('notes')
    .select('title, content')
    .order('id', { ascending: true });
  if (error) {
    response.status(502).json({ error: 'NOTES_UNAVAILABLE' });
    return;
  }
  response.status(200).json({ notes: data });
}
