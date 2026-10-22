import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { requireAdmin } from '../middleware/auth.js';
const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '');
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const token = jwt.sign({ sub: user._id.toString(), email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1d' });
    res.json({ token, admin: { name: user.name, email: user.email } });
  } catch (e) { next(e); }
});
router.get('/me', requireAdmin, (req, res) => res.json({ email: req.admin.email, role: req.admin.role }));
export default router;
