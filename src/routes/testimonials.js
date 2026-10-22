import { Router } from 'express';
import Testimonial from '../models/Testimonial.js';
import { requireAdmin } from '../middleware/auth.js';
const router = Router();
router.get('/', async (_req, res, next) => {
  try { res.json(await Testimonial.find({ isPublished: true }).sort({ createdAt: -1 }).limit(12)); } catch (e) { next(e); }
});
router.get('/admin/all', requireAdmin, async (_req, res, next) => {
  try { res.json(await Testimonial.find().sort({ createdAt: -1 })); } catch (e) { next(e); }
});
router.post('/', requireAdmin, async (req, res, next) => {
  try { res.status(201).json(await Testimonial.create(req.body)); } catch (e) { next(e); }
});
router.put('/:id', requireAdmin, async (req, res, next) => {
  try { const item = await Testimonial.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }); if (!item) return res.status(404).json({ message: 'Testimonial not found' }); res.json(item); } catch (e) { next(e); }
});
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try { const item = await Testimonial.findByIdAndDelete(req.params.id); if (!item) return res.status(404).json({ message: 'Testimonial not found' }); res.json({ message: 'Testimonial deleted' }); } catch (e) { next(e); }
});
export default router;
