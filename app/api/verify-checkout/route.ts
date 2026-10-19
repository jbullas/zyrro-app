import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { checkoutProduct, grantEntitlement } from '@/lib/entitlements';

export async function POST(req: NextRequest) {
  const { session_id } = await req.json() as { session_id: string };

  if (!session_id) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
  }

  const session = await getStripe().checkout.sessions.retrieve(session_id);

  if (session.payment_status === 'paid') {
    const userId = session.metadata?.user_id;
    if (!userId) {
      return NextResponse.json({ error: 'Missing user_id in session metadata' }, { status: 400 });
    }
    // #162: grant what the session paid for (no product = the $49 checkout).
    const product = checkoutProduct(session.metadata);
    if (!product) {
      return NextResponse.json({ error: 'Unknown product in session metadata' }, { status: 400 });
    }
    const granted = await grantEntitlement(userId, 'stripe', product);
    return NextResponse.json({ granted, product });
  }

  return NextResponse.json({ granted: false });
}
