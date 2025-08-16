import { requestIP, serve } from '../../src/node.ts';
import app from './app.ts';

serve(app({ requestIP }), {
  port: +process.env.PORT!,
});
