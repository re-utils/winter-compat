import { compile, handle, router } from '@mapl/web';
import { service, use } from 'udic';

const getRequestIP = service('requestIP')<(req: Request) => string | undefined>;

export default use([getRequestIP], (requestIP) => {
  const app = router(
    [],
    [
      handle.get('/', () => 'Hi'),

      handle.get('/empty', () => new Response(), handle.raw),
      handle.get('/invalid', () => {}, handle.raw),
      handle.get('/ip', (c) => requestIP(c.req)),

      handle.get('/set-cookie', (c) => {
        c.headers.push(['set-cookie', 'c=d'], ['set-cookie', 'a=b']);
      }),

      handle.post('/json', async (c) => c.req.json(), handle.json),
      handle.post('/form', async (c) => (await c.req.formData()).get('name')),
    ],
  );

  return compile(app);
});
