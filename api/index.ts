import dotenv from 'dotenv';
import { app } from '../src/app';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: 'local.env' });
}

if (process.env.NODE_ENV !== 'production' && require.main === module) {
  const PORT = process.env.PORT ?? 3000;
  app.listen(PORT, () => console.log(`TravelBestie Manager running on port ${PORT}`));
}

export default app;
