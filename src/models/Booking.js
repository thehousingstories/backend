import mongoose from 'mongoose';
const bookingSchema = new mongoose.Schema({
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  customerName: { type: String, required: true, trim: true },
  customerEmail: { type: String, required: true, lowercase: true, trim: true },
  customerPhone: { type: String, required: true, trim: true },
  preferredDate: { type: Date, required: true },
  preferredTime: { type: String, required: true },
  note: { type: String, maxlength: 1000, default: '' },
  visitFee: { type: Number, default: 299 },
  paymentStatus: { type: String, enum: ['Pending','Paid','Failed'], default: 'Pending' },
  bookingStatus: { type: String, enum: ['Requested','Confirmed','Completed','Cancelled'], default: 'Requested' },
  razorpayOrderId: String,
  razorpayPaymentId: String,
}, { timestamps: true });
export default mongoose.model('Booking', bookingSchema);
