import { jsPDF } from 'jspdf';

const doc = new jsPDF({ unit: 'pt', format: 'a4' });
const pageWidth = doc.internal.pageSize.getWidth();
const pageHeight = doc.internal.pageSize.getHeight();
const margin = 48;
const maxWidth = pageWidth - margin * 2;
let y = margin;

const addLine = (text, size = 11, gap = 8) => {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(size);
  const lines = doc.splitTextToSize(text, maxWidth);
  const needed = lines.length * (size + 4);
  if (y + needed > pageHeight - margin) {
    doc.addPage();
    y = margin;
  }
  doc.text(lines, margin, y);
  y += needed + gap;
};

const addTitle = (text) => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, margin, y);
  y += lines.length * 22 + 6;
};

const addSection = (title, items) => {
  addTitle(title);
  for (const item of items) addLine(`- ${item}`);
  y += 6;
};

addTitle('Garden Platform: Prodamus Subscription Access Report');
addLine(`Generated: ${new Date().toISOString()}`);
addLine('Scope: webhook processing, server-side access guard, blocked-screen UX, session hardening plan.');
y += 8;

addSection('Implemented Changes', [
  'Added migration: migrations/21_billing_subscription_access.sql.',
  'Profiles now include access_status, subscription_status, paid_until, provider identifiers, and session_version.',
  'Added tables: subscriptions and billing_webhook_logs.',
  'Added strict RLS guard via has_platform_access(auth.uid()) for protected tables.',
  'Added trigger touch_subscriptions_updated_at() to keep subscriptions.updated_at current on update.'
]);

addSection('Access Control Model', [
  'Single source of truth for platform access is access_status (except admin role).',
  'Removed hardcoded email bypass from client access checks and profile normalization.',
  'Private data is blocked server-side through PostgREST + RLS, not only at UI level.',
  'Manual pause (paused_manual) is separated from billing pause (paused_expired).'
]);

addSection('Webhook Reliability and Idempotency', [
  'Webhook endpoint: /api/billing/prodamus/webhook (alias /webhooks/prodamus).',
  'IP allowlist check and signature validation are applied before processing.',
  'external_id is deterministic: eventName:providerEventId, or eventName:payload:sha256(canonicalPayload).',
  'Idempotency: insert log on conflict do nothing, then reuse existing log.',
  'Race protection: pg_advisory_xact_lock(hashtext(lockKey)) per external_id.',
  'profile_not_found is now replayable: is_processed=false, status 202, reason profile_not_found_replayable.'
]);

addSection('User-Facing Behavior', [
  'When access is paused due to subscription end, login is blocked and a renewal screen is shown.',
  'After successful payment webhook (payment_success/auto_payment), access is restored automatically.',
  'If account is paused_manual, successful payment does not auto-restore access.',
  'Nightly reconcile job blocks overdue users as fallback when paid_until < now().'
]);

addSection('Session Invalidation Status (Honest State)', [
  'Current repo performs server-side data blocking immediately via RLS.',
  'Current repo sends best-effort POST /auth/logout-all on blocking events.',
  'Guaranteed forced logout for already-issued tokens requires auth-service validation of JWT session_version.'
]);

addSection('Prepared Delivery Artifacts', [
  'docs/auth-service-session-version-patch.md: exact middleware contract and pseudocode for auth-service.',
  'docs/prodamus-replay-scenarios.sql: real staging runbook (SQL before/after + webhook checks).',
  'docs/rls-audit-check.sql: query to audit permissive/restrictive RLS policies table by table.'
]);

doc.save('docs/prodamus-subscription-access-report.pdf');
console.log('PDF created: docs/prodamus-subscription-access-report.pdf');
