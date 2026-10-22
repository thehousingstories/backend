import jwt from 'jsonwebtoken';
import Customer from '../models/Customer.js';

export const signCustomerToken = (customer) =>
  jwt.sign({ sub: customer._id.toString(), role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '30d' });

async function resolveCustomer(req) {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'customer') return null;
    return await Customer.findById(payload.sub);
  } catch { return null; }
}

export async function requireCustomer(req, res, next) {
  const customer = await resolveCustomer(req);
  if (!customer) return res.status(401).json({ message: 'Please log in to continue.' });
  req.customer = customer;
  next();
}

// Attaches req.customer when a valid customer token is present, but never blocks the request
export async function optionalCustomer(req, _res, next) {
  req.customer = await resolveCustomer(req);
  next();
}
