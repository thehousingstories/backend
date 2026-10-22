import mongoose from 'mongoose';

const propertySchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 140 },
  slug: { type: String, unique: true, sparse: true },
  description: { type: String, required: true, maxlength: 6000 },
  propertyType: { type: String, enum: ['Apartment','Villa','Independent House','PG/Co-living','Studio','Commercial'], default: 'Apartment' },
  listingType: { type: String, enum: ['Rent','Sale'], default: 'Rent' },
  rent: { type: Number, min: 0, required: true },
  deposit: { type: Number, min: 0, default: 0 },
  bedrooms: { type: Number, min: 0, default: 1 },
  bathrooms: { type: Number, min: 0, default: 1 },
  areaSqFt: { type: Number, min: 0, default: 0 },
  furnishing: { type: String, enum: ['Furnished','Semi-furnished','Unfurnished'], default: 'Semi-furnished' },
  address: { type: String, required: true },
  locality: { type: String, required: true },
  city: { type: String, default: 'Bengaluru' },
  images: [{ type: String }],
  instagramReelUrl: { type: String, default: '' },
  amenities: [{ type: String }],
  featured: { type: Boolean, default: false },
  status: { type: String, enum: ['Available','Reserved','Rented','Sold'], default: 'Available' },
  isPublished: { type: Boolean, default: true },
}, { timestamps: true });

propertySchema.index({ title: 'text', description: 'text', locality: 'text', address: 'text' });
export default mongoose.model('Property', propertySchema);
