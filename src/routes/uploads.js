import { Router } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => (/^image\/(jpe?g|png|webp|avif)$/.test(file.mimetype) ? cb(null, true) : cb(new Error('Only JPG, PNG, WEBP or AVIF images are allowed.'))),
});

const configured = () => process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET;

router.post('/', requireAdmin, upload.array('images', 10), async (req, res, next) => {
  try {
    if (!configured()) return res.status(503).json({ message: 'Image upload is not configured. Add Cloudinary keys to backend/.env or paste image URLs instead.' });
    if (!req.files?.length) return res.status(400).json({ message: 'No images received.' });
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
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

export default router;
