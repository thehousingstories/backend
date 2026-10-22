import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import propertyRoutes from './routes/properties.js';
import bookingRoutes from './routes/bookings.js';
import authRoutes from './routes/auth.js';
import testimonialRoutes from './routes/testimonials.js';
import uploadRoutes from './routes/uploads.js';
import statsRoutes from './routes/stats.js';
import accountRoutes from './routes/account.js';
import { notFound, errorHandler } from './middleware/errors.js';

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL?.split(',') || 'http://localhost:5173' }));
app.use(express.json({ limit: '2mb' }));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'the-housing-stories-api' }));
app.use('/api/auth', authRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/testimonials', testimonialRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/account', accountRoutes);
// Public business contact details used by the WhatsApp / Call buttons
app.get('/api/config', (_req, res) => res.json({
  whatsapp: (process.env.BUSINESS_WHATSAPP || '').replace(/\D/g, ''),
  phone: (process.env.BUSINESS_PHONE || '').trim(),
  fee: Number(process.env.SCHEDULING_FEE_INR) || 299,
}));
app.use(notFound);
app.use(errorHandler);

const port = process.env.PORT || 5000;
mongoose.connect(process.env.MONGODB_URI)
  .then(() => app.listen(port, () => console.log(`API listening on ${port}`)))
  .catch((err) => { console.error('MongoDB connection failed:', err.message); process.exit(1); });
