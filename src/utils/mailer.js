import nodemailer from 'nodemailer';

let transporter;
const configured = () => process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

function transport() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port, secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendOtpEmail(to, code, purpose) {
  if (!configured()) {
    if (process.env.NODE_ENV === 'production') {
      const err = new Error('Email service is not configured. Please contact support.');
      err.status = 503;
      throw err;
    }
    // Development fallback so you can test without SMTP: the code is printed in the server console.
    console.log(`\n[DEV] Login code for ${to}: ${code}\n`);
    return;
  }
  const action = purpose === 'signup' ? 'create your account' : 'log in';
  await transport().sendMail({
    from: process.env.MAIL_FROM || `The Housing Stories <${process.env.SMTP_USER}>`,
    to,
    subject: 'Your Housing Stories verification code',
    text: `Your code to ${action} is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:460px;margin:auto;padding:28px;border:1px solid #eadfce;border-radius:16px;background:#fffaf2">
      <h2 style="margin:0 0 6px;color:#0a3d44">The Housing Stories</h2>
      <p style="color:#5d727a;margin:0 0 22px">Use this code to ${action}:</p>
      <div style="font-size:36px;letter-spacing:10px;font-weight:700;color:#0f766e;background:#e6f6f3;padding:18px;text-align:center;border-radius:12px">${code}</div>
      <p style="color:#5d727a;font-size:13px;margin-top:22px">This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</p></div>`,
  });
}
