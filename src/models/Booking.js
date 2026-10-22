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
  // 'Pending' = waiting for the one-time scheduling payment,
  // 'Paid'    = customer's one-time pass is active.
  paymentStatus: { type: String, enum: ['Pending', 'Paid', 'Failed'], default: 'Pending' },
  bookingStatus: { type: String, enum: ['Requested', 'Confirmed', 'Completed', 'Cancelled'], default: 'Requested' },
}, { timestamps: true });

export default mongoose.model('Booking', bookingSchema);
