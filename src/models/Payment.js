import mongoose from 'mongoose';

// Every Razorpay payment: either the unlimited pass or a single property visit.
const paymentSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  type: { type: String, enum: ['pass', 'visit'], required: true },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' }, // only for single-visit payments
  amount: { type: Number, required: true }, // in INR
  orderId: { type: String, required: true, unique: true },
  paymentId: String,
  status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created' },
  paidAt: Date,
}, { timestamps: true });

export default mongoose.model('Payment', paymentSchema);
