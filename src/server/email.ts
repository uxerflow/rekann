import type { AppConfig } from './config'

export interface Email {
  to: string
  subject: string
  text: string
  html: string
}
export function escapeHtml(text: string) {
  return text.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  )
}
function template(title: string, body: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:40px auto;color:#292929"><p style="color:#15835f;font-weight:700">Rekann</p><h1 style="font-size:24px">${escapeHtml(title)}</h1>${body}<hr style="border:0;border-top:1px solid #eee;margin-top:32px"><p style="color:#707070;font-size:12px">Your people, in one place.</p></div>`
}
export function otpEmail(to: string, otp: string, reset: boolean): Email {
  const subject = reset ? 'Reset your Rekann password' : 'Verify your email address'
  const text = `${subject}\n\nYour code is ${otp}. It expires in 10 minutes.\n\nIf you did not request this, you can ignore this email.`
  return {
    to,
    subject,
    text,
    html: template(
      subject,
      `<p>Enter this code to continue:</p><p style="font-size:32px;letter-spacing:8px;font-weight:600">${escapeHtml(otp)}</p><p>This code expires in 10 minutes.</p><p>If you did not request this, you can ignore this email.</p>`,
    ),
  }
}
export function invitationEmail(to: string, workspace: string, url: string): Email {
  const subject = `You're invited to join ${workspace} on Rekann`
  return {
    to,
    subject,
    text: `${subject}\n\nAccept your invitation: ${url}\n\nThis invitation expires in 7 days. Sign in using this email address.`,
    html: template(
      `Join ${workspace}`,
      `<p>You've been invited to your team's workspace.</p><p><a style="display:inline-block;background:#15835f;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none" href="${escapeHtml(url)}">Accept invitation</a></p><p>This invitation expires in 7 days. Sign in using this email address.</p>`,
    ),
  }
}
export async function sendEmail(config: AppConfig, email: Email) {
  if (config.EMAIL_DELIVERY === 'local') {
    const response = await fetch('http://127.0.0.1:8025/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(email),
    })
    if (!response.ok) throw new Error('Local email delivery failed.')
    return
  }
  if (!config.RESEND_API_KEY || !config.EMAIL_FROM)
    throw new Error('Email delivery is not configured.')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: config.EMAIL_FROM,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  })
  // Never log provider payloads: they can contain addresses, URLs, or credentials.
  if (!response.ok) throw new Error('Email delivery failed. Please try again.')
}
