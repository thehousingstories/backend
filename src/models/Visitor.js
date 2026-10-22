import mongoose from 'mongoose';

// One document per unique browser (anonymous id kept in the visitor's localStorage)
const visitorSchema = new mongoose.Schema({
  visitorId: { type: String, required: true, unique: true },
  visits: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model('Visitor', visitorSchema);