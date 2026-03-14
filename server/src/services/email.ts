import { CLIENT_URL } from '../config';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.EMAIL_FROM || 'MoviePicker <noreply@moviepicker.app>';

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

async function sendViaResend(payload: EmailPayload): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend send failed (${res.status}): ${body}`);
  }
}

function logToConsole(payload: EmailPayload, devUrl?: string): void {
  console.log('\n[email:dev]', '-'.repeat(60));
  console.log('  To:     ', payload.to);
  console.log('  Subject:', payload.subject);
  if (devUrl) console.log('  Link:   ', devUrl);
  console.log('-'.repeat(72), '\n');
}

export async function sendEmail(payload: EmailPayload, devUrl?: string): Promise<void> {
  if (!RESEND_API_KEY) {
    logToConsole(payload, devUrl);
    return;
  }
  try {
    await sendViaResend(payload);
  } catch (err) {
    console.error('[email] send failed, falling back to console log:', err);
    logToConsole(payload, devUrl);
  }
}

function wrap(inner: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #1a1a1a; color: #e8e2d5; border-radius: 16px;">
      <h1 style="font-size: 24px; color: #e8e2d5; margin: 0 0 16px;">MoviePicker</h1>
      ${inner}
      <p style="margin-top: 32px; font-size: 12px; color: #9a9284;">If you didn't expect this email, you can safely ignore it.</p>
    </div>
  `;
}

export function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${CLIENT_URL}/auth/verify?token=${encodeURIComponent(token)}`;
  return sendEmail(
    {
      to,
      subject: 'Verify your MoviePicker email',
      html: wrap(`
        <p>Welcome! Confirm your email to start picking movies.</p>
        <p style="margin: 24px 0;">
          <a href="${link}" style="display: inline-block; background: #ff6b6b; color: #1a1a1a; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: 600;">Verify email</a>
        </p>
        <p style="font-size: 12px; color: #9a9284;">Or copy this link: ${link}</p>
      `),
    },
    link,
  );
}

export function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${CLIENT_URL}/auth/reset?token=${encodeURIComponent(token)}`;
  return sendEmail(
    {
      to,
      subject: 'Reset your MoviePicker password',
      html: wrap(`
        <p>Someone asked to reset the password for this account.</p>
        <p>The reset link is valid for 15 minutes.</p>
        <p style="margin: 24px 0;">
          <a href="${link}" style="display: inline-block; background: #ff6b6b; color: #1a1a1a; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: 600;">Reset password</a>
        </p>
        <p style="font-size: 12px; color: #9a9284;">Or copy this link: ${link}</p>
      `),
    },
    link,
  );
}
