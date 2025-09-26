import { afterAll, describe, expect, test } from 'bun:test';
import { setTimeout } from 'node:timers/promises';

const PORT = {
  node: 3000,
  bun: 3001,
  deno: 3002,
  uws: 3003,
};

const ARGS: Record<keyof typeof PORT, string[]> = {
  node: ['node'],
  bun: ['bun', 'run'],
  deno: ['deno', 'run', '--allow-net', '--allow-env'],
  uws: ['node'],
};

const start = (runtime: keyof typeof ARGS) => {
  describe(runtime, async () => {
    const URL = 'http://localhost:' + PORT[runtime];

    // Launch server
    {
      const label = runtime + ': server started';
      console.time(label);

      const server = Bun.spawn(ARGS[runtime].concat([runtime + '.ts']), {
        cwd: import.meta.dir,
        env: {
          ...process.env,
          PORT: PORT[runtime] + '',
        },
        stdout: 'inherit',
      });
      afterAll(() => server.kill());

      // Wait until server starts
      while ((await fetch(URL).catch(() => {})) == null) {
        console.log(runtime + ': Pinging', URL + '...');
        await setTimeout(800);
      }

      console.timeEnd(label);
    }

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

      test('ip', async () => {
        const res = await fetch(URL + '/ip');
        expect(res.status).toBe(200);
        expect(await res.text()).toBeOneOf(['::1', '127.0.0.1']);
      });

      describe('headers', () => {
        test('set cookie', async () => {
          const res = await fetch(URL + '/set-cookie');
          expect(res.status).toBe(200);
          expect(res.headers.getSetCookie()).toContainAllValues(['c=d', 'a=b']);
        });
      });
    });

    describe('request', () => {
      describe('body', () => {
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
          expect(res.headers.get('content-type')).toStartWith(
            'application/json',
          );
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
  });
};

start('node');
start('bun');
start('deno');
start('uws');
