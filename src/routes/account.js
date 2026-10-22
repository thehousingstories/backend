import { Router } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import Customer from '../models/Customer.js';
import Otp from '../models/Otp.js';
import Booking from '../models/Booking.js';
import { sendOtpEmail } from '../utils/mailer.js';
import { requireCustomer, signCustomerToken } from '../middleware/customerAuth.js';

const router = Router();
const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_SECONDS = 45;
const MAX_ATTEMPTS = 5;

const clean = (v) => String(v ?? '').trim();
const normEmail = (v) => clean(v).toLowerCase();
const normPhone = (v) => {
  const s = clean(v).replace(/[\s()-]/g, '');
  return /^\+?\d{10,14}$/.test(s) ? s : null;
};
const hashCode = (email, code) => crypto.createHmac('sha256', process.env.JWT_SECRET || '').update(`${email}:${code}`).digest('hex');
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many attempts. Please try again in a few minutes.' } });

const publicCustomer = (c) => ({
  id: c._id, name: c.name, email: c.email, phone: c.phone, emailVerified: c.emailVerified,
  schedulingPaid: c.schedulingPaid, paidAt: c.paidAt, amountPaid: c.amountPaid, paymentId: c.razorpayPaymentId, createdAt: c.createdAt,
});

// Step 1: send a 6-digit code to the email (login or signup)
router.post('/otp/request', otpLimiter, async (req, res, next) => {
  try {
    const email = normEmail(req.body.email);
    const mode = req.body.mode === 'signup' ? 'signup' : 'login';
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });

    const existing = await Customer.findOne({ email });
    let name = '', phone = '';
    if (mode === 'signup') {
      name = clean(req.body.name);
      phone = normPhone(req.body.phone);
      if (name.length < 2) return res.status(400).json({ message: 'Please enter your full name.' });
      if (!phone) return res.status(400).json({ message: 'Enter a valid mobile number (10 to 14 digits).' });
      if (existing?.emailVerified) return res.status(409).json({ message: 'An account with this email already exists. Please log in instead.' });
    } else if (!existing) {
      return res.status(404).json({ message: 'No account found for this email. Please sign up first.' });
    }

    const prev = await Otp.findOne({ email });
    if (prev) {
      const wait = RESEND_SECONDS - Math.floor((Date.now() - prev.lastSentAt.getTime()) / 1000);
      if (wait > 0) return res.status(429).json({ message: `Please wait ${wait}s before requesting another code.`, retryAfter: wait });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    await Otp.findOneAndUpdate(
      { email },
      { email, purpose: mode, codeHash: hashCode(email, code), name, phone: phone || '', attempts: 0, lastSentAt: new Date(), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
      { upsert: true, setDefaultsOnInsert: true }
    );
    try { await sendOtpEmail(email, code, mode); }
    catch (err) {
      await Otp.deleteOne({ email });
      console.error('OTP email failed:', err.message);
      return res.status(503).json({ message: err.status === 503 ? err.message : 'We could not send the email right now. Please try again.' });
    }
    res.json({ ok: true, resendIn: RESEND_SECONDS });
  } catch (e) { next(e); }
});

// Step 2: verify the code and sign the customer in
router.post('/otp/verify', otpLimiter, async (req, res, next) => {
  try {
    const email = normEmail(req.body.email);
    const code = clean(req.body.code);
    const otp = await Otp.findOne({ email });
    if (!otp || otp.expiresAt < new Date()) return res.status(400).json({ message: 'This code has expired. Please request a new one.' });
    if (otp.attempts >= MAX_ATTEMPTS) { await Otp.deleteOne({ email }); return res.status(429).json({ message: 'Too many wrong attempts. Please request a new code.' }); }
    if (!/^\d{6}$/.test(code) || !safeEqual(hashCode(email, code), otp.codeHash)) {
      otp.attempts += 1; await otp.save();
      return res.status(400).json({ message: `Incorrect code. ${Math.max(0, MAX_ATTEMPTS - otp.attempts)} attempts left.` });
    }
    await Otp.deleteOne({ email });

    let customer = await Customer.findOne({ email });
    if (otp.purpose === 'signup') {
      if (!customer) customer = new Customer({ email, name: otp.name, phone: otp.phone });
      else { customer.name = otp.name || customer.name; customer.phone = otp.phone || customer.phone; }
    } else if (!customer) {
      return res.status(404).json({ message: 'No account found for this email.' });
    }
    customer.emailVerified = true;
    customer.lastLoginAt = new Date();
    await customer.save();
    res.json({ token: signCustomerToken(customer), customer: publicCustomer(customer) });
  } catch (e) { next(e); }
});

router.get('/me', requireCustomer, (req, res) => res.json({ customer: publicCustomer(req.customer) }));

router.patch('/me', requireCustomer, async (req, res, next) => {
  try {
    const name = clean(req.body.name);
    const phone = normPhone(req.body.phone);
    if (name.length < 2) return res.status(400).json({ message: 'Please enter your full name.' });
    if (!phone) return res.status(400).json({ message: 'Enter a valid mobile number.' });
    req.customer.name = name; req.customer.phone = phone;
    await req.customer.save();
    res.json({ customer: publicCustomer(req.customer) });
  } catch (e) { next(e); }
});

// My visits (paid visits, plus unpaid requests that are still on hold)
router.get('/bookings', requireCustomer, async (req, res, next) => {
  try {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);
    const bookings = await Booking.find({
      customer: req.customer._id,
      $or: [{ paymentStatus: 'Paid' }, { paymentStatus: 'Pending', createdAt: { $gte: cutoff } }],
    }).populate('property', 'title locality city images rent listingType').sort({ preferredDate: -1, createdAt: -1 });
    res.json(bookings);
  } catch (e) { next(e); }
});

router.patch('/bookings/:id/cancel', requireCustomer, async (req, res, next) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, customer: req.customer._id });
    if (!booking) return res.status(404).json({ message: 'Visit not found.' });
    if (['Completed', 'Cancelled'].includes(booking.bookingStatus)) return res.status(400).json({ message: `This visit is already ${booking.bookingStatus.toLowerCase()}.` });
    booking.bookingStatus = 'Cancelled';
    await booking.save();
    res.json(booking);
  } catch (e) { next(e); }
});

export default router;
