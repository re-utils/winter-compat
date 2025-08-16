import { requestIP, serve } from '../../src/bun.ts';
import app from './app/index.ts';

serve(app({ requestIP }), {
  port: +process.env.PORT!,
});
