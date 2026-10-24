import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema({
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  customerName: { type: String, required: true, trim: true },
  customerEmail: { type: String, required: true, lowercase: true, trim: true },
  customerPhone: { type: String, required: true, trim: true },
  preferredDate: { type: Date, required: true },
  preferredTime: { type: String, required: true },
  note: { type: String, maxlength: 1000, default: '' },
  // 'pass'   = covered by the unlimited visit pass (no extra payment)
  // 'single' = paid for this one property visit
  plan: { type: String, enum: ['pass', 'single'], default: 'pass' },
  amountPaid: { type: Number, default: 0 },
  paymentStatus: { type: String, enum: ['Pending', 'Paid', 'Failed'], default: 'Pending' },
  bookingStatus: { type: String, enum: ['Requested', 'Confirmed', 'Completed', 'Cancelled'], default: 'Requested' },
}, { timestamps: true });

export default mongoose.model('Booking', bookingSchema);
