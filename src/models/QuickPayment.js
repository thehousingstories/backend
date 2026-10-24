import mongoose from 'mongoose';

// One-page "pay ₹99" payments (name + phone only, no account). Tracked separately from visit fees.
const quickPaymentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  amount: { type: Number, required: true }, // INR
  orderId: { type: String, required: true, unique: true },
  paymentId: String,
  status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created' },
  paidAt: Date,
  handled: { type: Boolean, default: false }, // admin follow-up done
  token: { type: String, unique: true, sparse: true }, // secret id for the public receipt link
}, { timestamps: true });

export default mongoose.model('QuickPayment', quickPaymentSchema);
