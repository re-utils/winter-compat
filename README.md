# winter-compat
A small WinterCG server compability layer for all runtimes.

```ts
import { serve } from 'winter-compat';

await serve({
  fetch: compile(app),
  port: 3000,
});
```
