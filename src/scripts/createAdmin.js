import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'ChangeThisPassword123!') {
  console.error('Set ADMIN_EMAIL and a strong ADMIN_PASSWORD in .env before creating an admin.');
  process.exit(1);
}
await mongoose.connect(process.env.MONGODB_URI);
const email = process.env.ADMIN_EMAIL.toLowerCase().trim();
const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
const user = await User.findOneAndUpdate({ email }, { name: 'Administrator', email, passwordHash, role: 'admin' }, { upsert: true, new: true, setDefaultsOnInsert: true });
console.log(`Admin ready: ${user.email}`);
await mongoose.disconnect();
