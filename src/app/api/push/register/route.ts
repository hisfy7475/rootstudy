import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Body = {
  expo_push_token?: string;
  platform?: 'ios' | 'android';
  device_id?: string | null;
};

export async function POST(request: Request) {
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
  const platform = body.platform;

  if (!token || (platform !== 'ios' && platform !== 'android')) {
    return NextResponse.json(
      { error: 'expo_push_token and platform (ios|android) are required' },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: user.id,
      expo_push_token: token,
      platform,
      device_id: body.device_id ?? null,
      is_active: true,
      updated_at: now,
    },
    { onConflict: 'user_id,expo_push_token' }
  );

  if (error) {
    console.error('[push/register]', error);
    return NextResponse.json({ error: 'Failed to register token' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
