import { Router } from 'express';
import Visitor from '../models/Visitor.js';
import Property from '../models/Property.js';
import Booking from '../models/Booking.js';

const router = Router();
// Optional: add numbers from BEFORE this website existed (set in backend/.env, default 0)
const prior = (key) => Number(process.env[key]) || 0;

router.post('/visit', async (req, res, next) => {
  try {
    const id = String(req.body.visitorId || '');
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(id)) return res.status(400).json({ message: 'Invalid visitor id' });
    await Visitor.updateOne({ visitorId: id }, { $inc: { visits: 1 } }, { upsert: true });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/', async (_req, res, next) => {
  try {
    const [rented, happy, visitors] = await Promise.all([
      Property.countDocuments({ status: { $in: ['Rented', 'Sold'] } }),
      Booking.distinct('customer', { bookingStatus: 'Completed' }).then((a) => a.length),
      Visitor.countDocuments(),
    ]);
    res.json({
      rentedOut: rented + prior('STATS_PRIOR_RENTED'),
      happyCustomers: happy + prior('STATS_PRIOR_CUSTOMERS'),
      visitors: visitors + prior('STATS_PRIOR_VISITORS'),
    });
  } catch (e) { next(e); }
});

export default router;