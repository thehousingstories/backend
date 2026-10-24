import { Router } from 'express';
import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import Booking from '../models/Booking.js';
import Customer from '../models/Customer.js';
import Payment from '../models/Payment.js';
import Property from '../models/Property.js';
import { requireAdmin } from '../middleware/auth.js';
import { requireCustomer } from '../middleware/customerAuth.js';
import { nowIST, OPEN_MIN, CLOSE_MIN } from '../utils/slots.js';

const router = Router();
const passFee = () => Number(process.env.SCHEDULING_FEE_INR) || 299;       // unlimited visit pass
const singleFee = () => Number(process.env.SINGLE_VISIT_FEE_INR) || 149;   // one property visit
const clean = (v) => String(v ?? '').trim();

function razorpayClient() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}
// 'HH:MM' (24h, from the time picker) -> { label: '02:30 PM', minutes }
function parseTime(hhmm) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  return { label: `${String(h % 12 || 12).padStart(2, '0')}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`, minutes: h * 60 + Number(m[2]) };
}
const noPayments = (res) => res.status(503).json({ message: 'Online payments are not configured yet. Add Razorpay keys to backend/.env.' });

router.get('/fee', (_req, res) => res.json({ fee: passFee(), singleFee: singleFee(), currency: 'INR' }));

// Buy the unlimited visit pass (from the landing page)
router.post('/pass-order', requireCustomer, async (req, res, next) => {
  try {
    const customer = req.customer;
    if (customer.schedulingPaid) return res.status(400).json({ message: 'Your unlimited visit pass is already active.' });
    const client = razorpayClient();
    if (!client) return noPayments(res);
    const amount = passFee();
    const order = await client.orders.create({
      amount: amount * 100, currency: 'INR', receipt: `pass_${customer._id}`.slice(0, 40),
      notes: { customerId: String(customer._id), purpose: 'unlimited visit pass' },
    });
    await Payment.create({ customer: customer._id, type: 'pass', amount, orderId: order.id });
    res.status(201).json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (e) { next(e); }
});

// Schedule a visit. Pass holders book free; everyone else pays the single-visit fee for this property.
router.post('/schedule', requireCustomer, async (req, res, next) => {
  try {
    const customer = req.customer;
    const { propertyId, preferredDate, preferredTime } = req.body;
    const note = clean(req.body.note).slice(0, 1000);
    if (!propertyId || !preferredDate || !preferredTime) return res.status(400).json({ message: 'Please choose a date and a time slot.' });

    const property = await Property.findOne({ _id: propertyId, isPublished: true, status: 'Available' });
    if (!property) return res.status(404).json({ message: 'This property is no longer available.' });

    const hasPass = customer.schedulingPaid;
    const client = hasPass ? null : razorpayClient();
    if (!hasPass && !client) return noPayments(res);

    // A customer's earlier unpaid request is replaced by this one (lets them retry or change the slot)
    if (!hasPass) await Booking.deleteMany({ customer: customer._id, paymentStatus: 'Pending' });

    // The customer chooses their own date and time (any time between 8:00 AM and 9:00 PM)
    const dateStr = clean(preferredDate);
    const now = nowIST();
    const dayMs = 24 * 60 * 60 * 1000;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || Number.isNaN(new Date(dateStr).getTime()) || dateStr < now.date
      || new Date(dateStr) - new Date(now.date) > 90 * dayMs) {
      return res.status(400).json({ message: 'Choose a valid visit date within the next 90 days.' });
    }
    const t = parseTime(clean(preferredTime));
    if (!t || t.minutes < OPEN_MIN || t.minutes > CLOSE_MIN) return res.status(400).json({ message: 'Choose a time between 8:00 AM and 9:00 PM.' });
    if (dateStr === now.date && t.minutes < now.minutes + 30) return res.status(400).json({ message: 'Please choose a time at least 30 minutes from now.' });
    const timeLabel = t.label;
    const date = new Date(dateStr);

    const duplicate = await Booking.findOne({ customer: customer._id, property: property._id, preferredDate: date, preferredTime: timeLabel, bookingStatus: { $ne: 'Cancelled' }, paymentStatus: 'Paid' });
    if (duplicate) return res.status(409).json({ message: 'You already have a visit scheduled for this property at that time.' });

    const booking = await Booking.create({
      property: property._id, customer: customer._id,
      customerName: customer.name, customerEmail: customer.email, customerPhone: customer.phone,
      preferredDate: date, preferredTime: timeLabel, note,
      plan: hasPass ? 'pass' : 'single',
      paymentStatus: hasPass ? 'Paid' : 'Pending',
      bookingStatus: hasPass ? 'Confirmed' : 'Requested',
    });
    if (hasPass) return res.status(201).json({ requiresPayment: false, booking });

    const amount = singleFee();
    const order = await client.orders.create({
      amount: amount * 100, currency: 'INR', receipt: `visit_${booking._id}`.slice(0, 40),
      notes: { customerId: String(customer._id), bookingId: String(booking._id), purpose: 'single property visit' },
    });
    await Payment.create({ customer: customer._id, type: 'visit', booking: booking._id, amount, orderId: order.id });
    res.status(201).json({
      requiresPayment: true, booking, orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (e) { next(e); }
});

// Verify any Razorpay payment (pass or single visit)
router.post('/verify-payment', requireCustomer, async (req, res, next) => {
  try {
    const customer = req.customer;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const payment = await Payment.findOne({ orderId: razorpay_order_id, customer: customer._id });
    if (!payment) return res.status(400).json({ message: 'Invalid payment session.' });
    if (payment.status === 'paid') return res.json({ message: 'Payment already confirmed.', type: payment.type });

    const secret = process.env.RAZORPAY_KEY_SECRET || '';
    const expected = crypto.createHmac('sha256', secret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
    const sig = String(razorpay_signature || '');
    const valid = secret && sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
    if (!valid) {
      payment.status = 'failed'; await payment.save();
      if (payment.booking) await Booking.updateOne({ _id: payment.booking }, { paymentStatus: 'Failed' });
      return res.status(400).json({ message: 'Payment verification failed.' });
    }

    payment.status = 'paid'; payment.paymentId = razorpay_payment_id; payment.paidAt = new Date();
    await payment.save();

    if (payment.type === 'pass') {
      customer.schedulingPaid = true; customer.paidAt = payment.paidAt;
      customer.razorpayPaymentId = razorpay_payment_id; customer.amountPaid = payment.amount;
      await customer.save();
    } else {
      await Booking.updateOne({ _id: payment.booking }, { paymentStatus: 'Paid', bookingStatus: 'Confirmed', amountPaid: payment.amount });
    }
    res.json({ message: 'Payment received.', type: payment.type });
  } catch (e) { next(e); }
});

router.get('/admin/all', requireAdmin, async (_req, res, next) => {
  try { res.json(await Booking.find().populate('property', 'title locality rent').sort({ createdAt: -1 })); } catch (e) { next(e); }
});

router.get('/admin/customers', requireAdmin, async (_req, res, next) => {
  try { res.json(await Customer.find().sort({ createdAt: -1 })); } catch (e) { next(e); }
});

router.get('/admin/payments', requireAdmin, async (_req, res, next) => {
  try {
    res.json(await Payment.find({ status: 'paid' }).populate('customer', 'name email')
      .populate({ path: 'booking', select: 'property', populate: { path: 'property', select: 'title' } }).sort({ paidAt: -1 }));
  } catch (e) { next(e); }
});

router.patch('/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const allowed = ['Requested', 'Confirmed', 'Completed', 'Cancelled'];
    if (!allowed.includes(req.body.bookingStatus)) return res.status(400).json({ message: 'Invalid booking status' });
    const item = await Booking.findByIdAndUpdate(req.params.id, { bookingStatus: req.body.bookingStatus }, { new: true });
    if (!item) return res.status(404).json({ message: 'Booking not found' });
    res.json(item);
  } catch (e) { next(e); }
});

export default router;
