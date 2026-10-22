import jwt from 'jsonwebtoken';
export function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Admin sign-in required' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    req.admin = payload;
    next();
  } catch { return res.status(401).json({ message: 'Session expired. Sign in again.' }); }
}
