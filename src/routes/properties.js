import { Router } from 'express';
import Property from '../models/Property.js';
import { requireAdmin } from '../middleware/auth.js';
const router = Router();

function slugify(value) {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
}
router.get('/', async (req, res, next) => {
  try {
    const { q, city, listingType, propertyType, minRent, maxRent, featured, page = 1, limit = 12 } = req.query;
    const filter = { isPublished: true, status: 'Available' };
    if (q) filter.$text = { $search: q };
    if (city) filter.city = new RegExp(String(city), 'i');
    if (listingType) filter.listingType = listingType;
    if (propertyType) filter.propertyType = propertyType;
    if (featured === 'true') filter.featured = true;
    if (minRent || maxRent) filter.rent = { ...(minRent ? { $gte: Number(minRent) } : {}), ...(maxRent ? { $lte: Number(maxRent) } : {}) };
    const p = Math.max(1, Number(page) || 1), l = Math.min(50, Math.max(1, Number(limit) || 12));
    const [items, total] = await Promise.all([
      Property.find(filter).sort({ featured: -1, createdAt: -1 }).skip((p - 1) * l).limit(l),
      Property.countDocuments(filter)
    ]);
    res.json({ items, total, page: p, pages: Math.ceil(total / l) });
  } catch (e) { next(e); }
});
router.get('/admin/all', requireAdmin, async (_req, res, next) => {
  try { res.json(await Property.find().sort({ createdAt: -1 })); } catch (e) { next(e); }
});
router.get('/:id', async (req, res, next) => {
  try {
    const item = await Property.findOne({ _id: req.params.id, isPublished: true });
    if (!item) return res.status(404).json({ message: 'Property not found' });
    res.json(item);
  } catch (e) { next(e); }
});
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const data = { ...req.body, slug: slugify(req.body.title || 'property') };
    const item = await Property.create(data);
    res.status(201).json(item);
  } catch (e) { next(e); }
});
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const item = await Property.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ message: 'Property not found' });
    res.json(item);
  } catch (e) { next(e); }
});
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const item = await Property.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: 'Property not found' });
    res.json({ message: 'Property deleted' });
  } catch (e) { next(e); }
});
export default router;
