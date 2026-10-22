import mongoose from 'mongoose';

// A customer account (email + OTP login). They pay the scheduling fee ONCE,
// then can schedule visits to any number of properties.
const customerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  phone: { type: String, required: true, trim: true },
  emailVerified: { type: Boolean, default: false },
  lastLoginAt: Date,
  schedulingPaid: { type: Boolean, default: false },
  paidAt: Date,
  razorpayOrderId: String,
  razorpayPaymentId: String,
  amountPaid: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model('Customer', customerSchema);
