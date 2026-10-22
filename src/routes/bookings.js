import { Router } from 'express';
import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import Booking from '../models/Booking.js';
import Property from '../models/Property.js';
import { requireAdmin } from '../middleware/auth.js';
import { optionalCustomer, requireCustomer } from '../middleware/customerAuth.js';
import { getDaysAvailability, getSlots, OPEN_MIN, CLOSE_MIN, VISIT_MIN, GAP_MIN } from '../utils/slots.js';
import Customer from '../models/Customer.js';

const router = Router();
const feeInr = () => Number(process.env.SCHEDULING_FEE_INR) || 299;
const clean = (v) => String(v ?? '').trim();

function razorpayClient() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

router.get('/fee', (_req, res) => res.json({ fee: feeInr(), currency: 'INR', oneTime: true }));

// Free slots for each of the next 14 days (a logged-in customer's own unpaid hold doesn't count against them)
router.get('/availability', optionalCustomer, async (req, res, next) => {
  try { res.json({ days: await getDaysAvailability(Booking, clean(req.query.propertyId), 14, req.customer?._id) }); } catch (e) { next(e); }
});

router.get('/slots', optionalCustomer, async (req, res, next) => {
  try {
    const slots = await getSlots(Booking, clean(req.query.propertyId), clean(req.query.date), req.customer?._id);
    if (!slots) return res.status(400).json({ message: 'Choose a valid future date.' });
    res.json({ slots, visitMinutes: VISIT_MIN, gapMinutes: GAP_MIN, opens: OPEN_MIN, closes: CLOSE_MIN });
  } catch (e) { next(e); }
});

// Schedule a visit (login required). Free if the customer already paid once; otherwise returns a Razorpay order.
router.post('/schedule', requireCustomer, async (req, res, next) => {
  try {
    const customer = req.customer;
    const { propertyId, preferredDate, preferredTime } = req.body;
    const note = clean(req.body.note).slice(0, 1000);
    if (!propertyId || !preferredDate || !preferredTime) return res.status(400).json({ message: 'Please choose a date and a time slot.' });

    const property = await Property.findOne({ _id: propertyId, isPublished: true, status: 'Available' });
    if (!property) return res.status(404).json({ message: 'This property is no longer available.' });

    // An unpaid customer's earlier unpaid request is replaced by this one (lets them retry or change the slot)
    if (!customer.schedulingPaid) await Booking.deleteMany({ customer: customer._id, paymentStatus: 'Pending' });

    const slots = await getSlots(Booking, property._id, clean(preferredDate), customer._id);
    if (!slots) return res.status(400).json({ message: 'Choose a valid future visit date.' });
    const chosen = slots.find((s) => s.time === preferredTime);
    if (!chosen) return res.status(400).json({ message: 'Choose a time slot between 8:00 AM and 9:00 PM.' });
    if (!chosen.available) return res.status(409).json({ message: 'That time slot is no longer available. Please pick another slot.' });
    const date = new Date(clean(preferredDate));

    const duplicate = await Booking.findOne({ customer: customer._id, property: property._id, preferredDate: date, preferredTime, bookingStatus: { $ne: 'Cancelled' }, paymentStatus: 'Paid' });
    if (duplicate) return res.status(409).json({ message: 'You already have a visit scheduled for this property at that time.' });

    const alreadyPaid = customer.schedulingPaid;
    const booking = await Booking.create({
      property: property._id, customer: customer._id,
      customerName: customer.name, customerEmail: customer.email, customerPhone: customer.phone,
      preferredDate: date, preferredTime, note,
      paymentStatus: alreadyPaid ? 'Paid' : 'Pending',
      bookingStatus: alreadyPaid ? 'Confirmed' : 'Requested',
    });

    if (alreadyPaid) return res.status(201).json({ requiresPayment: false, booking });

    const client = razorpayClient();
    if (!client) return res.status(503).json({ message: 'Online payments are not configured yet. Add Razorpay keys to backend/.env.' });
    const order = await client.orders.create({
      amount: feeInr() * 100, currency: 'INR', receipt: `pass_${customer._id}`.slice(0, 40),
      notes: { customerId: String(customer._id), purpose: 'one-time scheduling pass' },
    });
    customer.razorpayOrderId = order.id;
    await customer.save();
    res.status(201).json({
      requiresPayment: true, booking, bookingId: booking._id,
      orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (e) { next(e); }
});

// Verify the one-time payment, activate the pass, and confirm this customer's pending visit
router.post('/verify-payment', requireCustomer, async (req, res, next) => {
  try {
    const customer = req.customer;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!customer.razorpayOrderId || customer.razorpayOrderId !== razorpay_order_id) return res.status(400).json({ message: 'Invalid payment session.' });

    const secret = process.env.RAZORPAY_KEY_SECRET || '';
    const expected = crypto.createHmac('sha256', secret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
    const valid = secret && razorpay_signature && expected.length === String(razorpay_signature).length
      && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(razorpay_signature)));
    if (!valid) {
      await Booking.updateMany({ customer: customer._id, paymentStatus: 'Pending' }, { paymentStatus: 'Failed' });
      return res.status(400).json({ message: 'Payment verification failed.' });
    }

    customer.schedulingPaid = true;
    customer.paidAt = new Date();
    customer.razorpayPaymentId = razorpay_payment_id;
    customer.amountPaid = feeInr();
    await customer.save();
    await Booking.updateMany(
      { customer: customer._id, paymentStatus: 'Pending', bookingStatus: 'Requested' },
      { paymentStatus: 'Paid', bookingStatus: 'Confirmed' }
    );
    res.json({ message: 'Payment received. Your visit is confirmed.' });
  } catch (e) { next(e); }
});

router.get('/admin/all', requireAdmin, async (_req, res, next) => {
  try {
    const bookings = await Booking.find().populate('property', 'title locality rent').sort({ createdAt: -1 });
    res.json(bookings);
  } catch (e) { next(e); }
});

router.get('/admin/customers', requireAdmin, async (_req, res, next) => {
  try { res.json(await Customer.find().sort({ createdAt: -1 })); } catch (e) { next(e); }
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
