import { Router } from 'express';
import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import rateLimit from 'express-rate-limit';
import QuickPayment from '../models/QuickPayment.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();
const fee = () => Number(process.env.QUICK_PAY_FEE_INR) || 99;
const clean = (v) => String(v ?? '').trim();
const normPhone = (v) => { const s = clean(v).replace(/[\s()-]/g, ''); return /^\+?\d{10,14}$/.test(s) ? s : null; };
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many attempts. Please try again in a few minutes.' } });

const razorpayClient = () => (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET }) : null);
const summary = (p) => ({ id: p._id, ref: String(p._id).slice(-6).toUpperCase(), name: p.name, phone: p.phone, amount: p.amount, paymentId: p.paymentId, paidAt: p.paidAt, token: p.token });

// Step 1: customer gives name + phone, we create the Razorpay order
router.post('/order', limiter, async (req, res, next) => {
  try {
    const name = clean(req.body.name).slice(0, 80);
    const phone = normPhone(req.body.phone);
    if (name.length < 2) return res.status(400).json({ message: 'Please enter your name.' });
    if (!phone) return res.status(400).json({ message: 'Enter a valid mobile number (10 to 14 digits).' });
    const client = razorpayClient();
    if (!client) return res.status(503).json({ message: 'Online payments are not configured yet.' });

    const amount = fee();
    const order = await client.orders.create({
      amount: amount * 100, currency: 'INR', receipt: `quick_${Date.now()}`.slice(0, 40),
      notes: { purpose: 'quick payment', name: name.slice(0, 60), phone },
    });
    await QuickPayment.create({ name, phone, amount, orderId: order.id, token: crypto.randomBytes(16).toString('hex') });
    res.status(201).json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (e) { next(e); }
});

// Step 2: verify the payment signature and record it
router.post('/verify', limiter, async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const payment = await QuickPayment.findOne({ orderId: clean(razorpay_order_id) });
    if (!payment) return res.status(400).json({ message: 'Invalid payment session.' });
    if (payment.status === 'paid') return res.json({ payment: summary(payment) });

    const secret = process.env.RAZORPAY_KEY_SECRET || '';
    const expected = crypto.createHmac('sha256', secret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
    const sig = clean(razorpay_signature);
    const valid = secret && sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
    if (!valid) { payment.status = 'failed'; await payment.save(); return res.status(400).json({ message: 'Payment verification failed.' }); }

    payment.status = 'paid'; payment.paymentId = razorpay_payment_id; payment.paidAt = new Date();
    await payment.save();
    res.json({ payment: summary(payment) });
  } catch (e) { next(e); }
});

// Public receipt (opened from the WhatsApp message). The secret token in the link is the only way to find it.
router.get('/receipt/:token', limiter, async (req, res, next) => {
  try {
    const token = clean(req.params.token);
    if (!/^[a-f0-9]{32}$/.test(token)) return res.status(404).json({ message: 'Receipt not found.' });
    const payment = await QuickPayment.findOne({ token, status: 'paid' });
    if (!payment) return res.status(404).json({ message: 'Receipt not found.' });
    res.json({ payment: summary(payment) });
  } catch (e) { next(e); }
});

router.get('/admin/all', requireAdmin, async (_req, res, next) => {
  try { res.json(await QuickPayment.find({ status: 'paid' }).sort({ paidAt: -1 })); } catch (e) { next(e); }
});

router.patch('/admin/:id/handled', requireAdmin, async (req, res, next) => {
  try {
    const item = await QuickPayment.findByIdAndUpdate(req.params.id, { handled: !!req.body.handled }, { new: true });
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json(item);
  } catch (e) { next(e); }
});

export default router;
