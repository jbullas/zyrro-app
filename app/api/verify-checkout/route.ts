import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { grantEntitlement } from '@/lib/entitlements';

export async function POST(req: NextRequest) {
  const { session_id, user_id } = await req.json() as { session_id: string; user_id: string };

  if (!session_id || !user_id) {
    return NextResponse.json({ error: 'Missing session_id or user_id' }, { status: 400 });
  }

  const session = await getStripe().checkout.sessions.retrieve(session_id);

  if (session.payment_status === 'paid' && session.metadata?.user_id === user_id) {
    await grantEntitlement(user_id, 'stripe');
    return NextResponse.json({ granted: true });
  }

  return NextResponse.json({ granted: false });
}
