import { Router } from 'express';
import Reel from '../models/Reel.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();
const clean = (v) => String(v ?? '').trim();
const isHttp = (u) => /^https?:\/\//i.test(u);
const isInstagram = (u) => /^https?:\/\/(www\.)?instagram\.com\/(reel|reels|p|tv)\/[A-Za-z0-9_-]+/i.test(u);

function readBody(b) {
  const source = b.source === 'instagram' ? 'instagram' : 'upload';
  const data = {
    title: clean(b.title), caption: clean(b.caption), source,
    videoUrl: clean(b.videoUrl), posterUrl: clean(b.posterUrl), instagramUrl: clean(b.instagramUrl),
    isPublished: b.isPublished !== false && b.isPublished !== 'false',
    sortOrder: Number(b.sortOrder) || 0,
    property: b.property || undefined,
  };
  if (!data.title) return { error: 'Please enter a title.' };
  if (source === 'upload' && !isHttp(data.videoUrl)) return { error: 'Upload a video or paste a direct video link (.mp4).' };
  if (source === 'instagram' && !isInstagram(data.instagramUrl)) return { error: 'Paste a valid Instagram reel link, like https://www.instagram.com/reel/XXXX/' };
  if (data.posterUrl && !isHttp(data.posterUrl)) data.posterUrl = '';
  return { data };
}

// Public: published reels for the website
router.get('/', async (_req, res, next) => {
  try {
    const reels = await Reel.find({ isPublished: true }).sort({ sortOrder: -1, createdAt: -1 }).limit(30).populate('property', 'title locality');
    res.json(reels);
  } catch (e) { next(e); }
});

router.get('/admin/all', requireAdmin, async (_req, res, next) => {
  try { res.json(await Reel.find().sort({ sortOrder: -1, createdAt: -1 }).populate('property', 'title')); } catch (e) { next(e); }
});

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = readBody(req.body);
    if (error) return res.status(400).json({ message: error });
    res.status(201).json(await Reel.create(data));
  } catch (e) { next(e); }
});

router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const current = await Reel.findById(req.params.id);
    if (!current) return res.status(404).json({ message: 'Reel not found' });
    const { data, error } = readBody({ ...current.toObject(), ...req.body });
    if (error) return res.status(400).json({ message: error });
    Object.assign(current, data); await current.save();
    res.json(current);
  } catch (e) { next(e); }
});

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try { await Reel.findByIdAndDelete(req.params.id); res.json({ ok: true }); } catch (e) { next(e); }
});

export default router;
