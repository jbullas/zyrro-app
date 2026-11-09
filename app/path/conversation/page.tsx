import { redirect } from 'next/navigation';

// The Path conversation now lives on /path itself (Miroslav, 2026-11-09):
// its intro, the conversation and "Your path" (components/PathConversation.tsx).
export default function PathConversationRedirect() {
  redirect('/path');
}
