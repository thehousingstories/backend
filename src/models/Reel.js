import mongoose from 'mongoose';

const reelSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  caption: { type: String, trim: true, maxlength: 400, default: '' },
  source: { type: String, enum: ['upload', 'instagram'], default: 'upload' },
  videoUrl: { type: String, default: '' },     // for uploaded / direct video files
  posterUrl: { type: String, default: '' },    // thumbnail
  instagramUrl: { type: String, default: '' }, // for Instagram reels
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
  isPublished: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model('Reel', reelSchema);
