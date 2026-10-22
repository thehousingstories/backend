import mongoose from 'mongoose';

// One pending email OTP per email. Codes are stored hashed and expire automatically.
const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  purpose: { type: String, enum: ['login', 'signup'], required: true },
  codeHash: { type: String, required: true },
  name: { type: String, default: '' },    // signup details kept until the code is verified
  phone: { type: String, default: '' },
  attempts: { type: Number, default: 0 },
  lastSentAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

export default mongoose.model('Otp', otpSchema);
