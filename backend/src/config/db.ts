import mongoose from 'mongoose';

const connectDB = async (): Promise<void> => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri || mongoUri.includes('localhost') || mongoUri.includes('127.0.0.1')) {
    console.log('⚡ Running with Supabase & JSON storage fallback (no local MongoDB).');
    return;
  }
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 2000 });
    console.log('✅ Connected to MongoDB successfully at:', mongoUri);
  } catch (error) {
    console.log('ℹ️ MongoDB connection bypassed. Using Supabase/Local storage.');
  }
};

export default connectDB;
