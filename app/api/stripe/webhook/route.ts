import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { grantEntitlement } from '@/lib/entitlements';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: 'Webhook signature invalid' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.user_id;
    if (userId && session.payment_status === 'paid') {
      await grantEntitlement(userId, 'stripe');
    }
  }

  return NextResponse.json({ received: true });
}
