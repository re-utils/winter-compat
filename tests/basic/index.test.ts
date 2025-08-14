import { describe, expect, test } from 'bun:test';
import { after } from 'node:test';

const ARGS = {
  node: ['--import', 'jiti/register'],
};

const start = (runtime: keyof typeof ARGS) => {
  describe(runtime + ' server', async () => {
    {
      const label = runtime + ' server started';
      console.time(label);

      const server = Bun.spawn([runtime, ...ARGS[runtime], './server.ts'], {
        cwd: import.meta.dir,
      });
      after(() => server.kill());
      // Wait for the first console log
      await server.stdout.getReader().read();

      console.timeEnd(label);
    }

    const URL = 'http://localhost:3000';

    describe('response', () => {
      test('text', async () => {
        const res = await fetch(URL + '/');
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('Hi');
      });

      test('empty', async () => {
        const res = await fetch(URL + '/empty');
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('');
      });

      test('invalid', async () => {
        const res = await fetch(URL + '/invalid');
        expect(res.status).toBe(204);
        expect(await res.text()).toBe('');
      });

      test('ip', async () => {
        const res = await fetch(URL + '/ip');
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('::1');
      });
    });

    describe('read body', () => {
      test('json', async () => {
        const json = {
          name: 'admin',
          pwd: 'admin',
        };

        const res = await fetch(URL + '/json', {
          method: 'POST',
          body: JSON.stringify(json),
        });

        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toStartWith('application/json');
        expect(await res.json()).toEqual(json);
      });

      test('formdata', async () => {
        const form = new FormData();
        form.append('name', 'admin');

        const res = await fetch(URL + '/form', {
          method: 'POST',
          body: form,
        });

        expect(res.status).toBe(200);
        expect(await res.text()).toEqual('admin');
      });
    });
  });
};

start('node');
