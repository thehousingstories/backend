import mongoose from 'mongoose';
const testimonialSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  role: { type: String, default: 'Happy customer' },
  message: { type: String, required: true, maxlength: 800 },
  rating: { type: Number, min: 1, max: 5, default: 5 },
  isPublished: { type: Boolean, default: true },
}, { timestamps: true });
export default mongoose.model('Testimonial', testimonialSchema);
