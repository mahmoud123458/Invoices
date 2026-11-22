import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { initializeDatabase } from './startup';
import { errorHandler } from './middleware/errorHandler';

import authRoutes from './routes/authRoutes';
import clientRoutes from './routes/clientRoutes';
import productRoutes from './routes/productRoutes';
import invoiceRoutes from './routes/invoiceRoutes';
import shippingRoutes from './routes/shippingRoutes';
import purchaseOrderRoutes from './routes/purchaseOrderRoutes';
import expenseRoutes from './routes/expenseRoutes';
import financeRoutes from './routes/financeRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Middleware
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

let databaseInitialization: Promise<void> | undefined;
app.use((_req, _res, next) => {
  if (!databaseInitialization) {
    databaseInitialization = initializeDatabase().catch((error) => {
      databaseInitialization = undefined;
      throw error;
    });
  }
  void databaseInitialization.then(() => next()).catch(next);
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/products', productRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/finance', financeRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'Invoice API is running 🚀' });
});

// Error handler
app.use(errorHandler);

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

export default app;
