import { requestIP, serve } from '../../src/uws.ts';
import app from './app.ts';

serve(app({ requestIP }), {
  port: +process.env.PORT!,
});
