# winter-compat
A small WinterCG server compability layer for all runtimes.

```ts
import { serve } from 'winter-compat';

await serve(
  (req) => new Response(req.method + ' ' + req.url),
  // Default options (can be omitted)
  { port: 3000, hostname: '127.0.0.1' }
);
```
