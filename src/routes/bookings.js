import { Router } from 'express';
import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import Booking from '../models/Booking.js';
import Property from '../models/Property.js';
import { requireAdmin } from '../middleware/auth.js';
const router = Router();

function razorpayClient() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}
router.post('/create-order', async (req, res, next) => {
  try {
    const { propertyId, customerName, customerEmail, customerPhone, preferredDate, preferredTime, note = '' } = req.body;
    if (!propertyId || !customerName || !customerEmail || !customerPhone || !preferredDate || !preferredTime) {
      return res.status(400).json({ message: 'Please complete all required booking fields.' });
    }
    const property = await Property.findOne({ _id: propertyId, isPublished: true, status: 'Available' });
    if (!property) return res.status(404).json({ message: 'This property is no longer available.' });
    const date = new Date(preferredDate);
    if (Number.isNaN(date.getTime()) || date < new Date(new Date().toDateString())) return res.status(400).json({ message: 'Choose a valid future visit date.' });
    const booking = await Booking.create({ property: property._id, customerName, customerEmail, customerPhone, preferredDate: date, preferredTime, note });
    const client = razorpayClient();
    if (!client) {
      return res.status(503).json({ message: 'Online payments are not configured yet. Add Razorpay test keys to backend/.env.', bookingId: booking._id });
    }
    const order = await client.orders.create({ amount: 29900, currency: 'INR', receipt: `visit_${booking._id}` });
    booking.razorpayOrderId = order.id;
    await booking.save();
    res.status(201).json({ bookingId: booking._id, orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (e) { next(e); }
});
router.post('/verify-payment', async (req, res, next) => {
  try {
    const { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const booking = await Booking.findById(bookingId);
    if (!booking || booking.razorpayOrderId !== razorpay_order_id) return res.status(400).json({ message: 'Invalid booking/order.' });
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '').update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
    if (!process.env.RAZORPAY_KEY_SECRET || expected !== razorpay_signature) {
      booking.paymentStatus = 'Failed'; await booking.save();
      return res.status(400).json({ message: 'Payment verification failed.' });
    }
    booking.razorpayPaymentId = razorpay_payment_id;
    booking.paymentStatus = 'Paid';
    booking.bookingStatus = 'Confirmed';
    await booking.save();
    res.json({ message: 'Visit request confirmed.', booking });
  } catch (e) { next(e); }
});
router.get('/admin/all', requireAdmin, async (_req, res, next) => {
  try { res.json(await Booking.find().populate('property', 'title locality rent').sort({ createdAt: -1 })); } catch (e) { next(e); }
});
router.patch('/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const allowed = ['Requested','Confirmed','Completed','Cancelled'];
    if (!allowed.includes(req.body.bookingStatus)) return res.status(400).json({ message: 'Invalid booking status' });
    const item = await Booking.findByIdAndUpdate(req.params.id, { bookingStatus: req.body.bookingStatus }, { new: true });
    if (!item) return res.status(404).json({ message: 'Booking not found' });
    res.json(item);
  } catch (e) { next(e); }
});
export default router;
