import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Body = {
  expo_push_token?: string;
};

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const token = body.expo_push_token?.trim();
  if (!token) {
    return NextResponse.json({ error: 'expo_push_token is required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('push_tokens')
    .update({ is_active: false, updated_at: now })
    .eq('user_id', user.id)
    .eq('expo_push_token', token);

  if (error) {
    console.error('[push/unregister]', error);
    return NextResponse.json({ error: 'Failed to unregister token' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
