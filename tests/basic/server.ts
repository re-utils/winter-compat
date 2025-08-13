import { compile, handle, router } from '@mapl/web';
import { requestIP, serve } from 'winter-compat';

const app = router(
  [],
  [
    handle.get('/', () => 'Hi'),
    handle.get('/empty', () => new Response(), handle.raw),
    handle.get('/invalid', () => {}, handle.raw),
    handle.get('/ip', (c) => requestIP(c.req)),
    handle.post('/json', async (c) => c.req.json(), handle.json),
    handle.post('/form', async (c) => (await c.req.formData()).get('name')),
  ],
);

serve({
  fetch: compile(app),
  port: 3000,
}, () => console.log('App ready'));
