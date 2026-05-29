import express from 'express';
import { healthRouter } from './routes/health.js';
import { credentialsRouter } from './routes/credentials.js';
import { oauth2Router } from './routes/oauth2.js';

const app = express();
const PORT = process.env.PORT ?? 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/health', healthRouter);
app.use('/credentials', credentialsRouter);
app.use('/oauth2', oauth2Router);

app.listen(PORT, () => {
  console.log(`[backend] Server running at http://localhost:${PORT}`);
});

export default app;
