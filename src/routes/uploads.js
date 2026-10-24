import { Router } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => (/^image\/(jpe?g|png|webp|avif)$/.test(file.mimetype) ? cb(null, true) : cb(new Error('Only JPG, PNG, WEBP or AVIF images are allowed.'))),
});
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => (/^video\/(mp4|quicktime|webm|x-matroska)$/.test(file.mimetype) ? cb(null, true) : cb(new Error('Please upload an MP4, MOV or WEBM video.'))),
});

const configured = () => process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET;
const setup = () => cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true,
});
const notConfigured = (res) => res.status(503).json({ message: 'Uploads are not configured. Add Cloudinary keys to backend/.env or paste a link instead.' });

router.post('/', requireAdmin, imageUpload.array('images', 10), async (req, res, next) => {
  try {
    if (!configured()) return notConfigured(res);
    if (!req.files?.length) return res.status(400).json({ message: 'No images received.' });
    setup();
    const urls = await Promise.all(req.files.map((file) => new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'the-housing-stories', transformation: [{ width: 1800, crop: 'limit', quality: 'auto', fetch_format: 'auto' }] },
        (err, result) => (err ? reject(err) : resolve(result.secure_url))
      );
      stream.end(file.buffer);
    })));
    res.status(201).json({ urls });
  } catch (e) { next(e); }
});

// Reel video upload (max 60 MB). Returns a web-friendly MP4 link plus a thumbnail.
router.post('/video', requireAdmin, (req, res, next) => {
  videoUpload.single('video')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'Video is too large. Maximum size is 60 MB.' : err.message });
    next();
  });
}, async (req, res, next) => {
  try {
    if (!configured()) return notConfigured(res);
    if (!req.file) return res.status(400).json({ message: 'No video received.' });
    setup();
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ resource_type: 'video', folder: 'the-housing-stories/reels' }, (e, r) => (e ? reject(e) : resolve(r)));
      stream.end(req.file.buffer);
    });
    const url = cloudinary.url(result.public_id, { resource_type: 'video', format: 'mp4', secure: true, transformation: [{ width: 720, crop: 'limit', quality: 'auto' }] });
    const poster = cloudinary.url(result.public_id, { resource_type: 'video', format: 'jpg', secure: true, transformation: [{ width: 480, crop: 'limit', start_offset: '1' }] });
    res.status(201).json({ url, poster });
  } catch (e) { next(e); }
});

export default router;
