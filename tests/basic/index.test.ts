import { afterAll, describe, expect, test } from 'bun:test';
import { setTimeout } from 'node:timers/promises';

const PORT = {
  node: 3000,
  bun: 3001
};

const ARGS: Record<keyof typeof PORT, string[]> = {
  node: [],
  bun: ['run']
};

const start = (runtime: keyof typeof ARGS) => {
  describe(runtime, async () => {
    const URL = 'http://localhost:' + PORT[runtime];

    // Launch server
    {
      const label = runtime + ': server started';
      console.time(label);

      const server = Bun.spawn([runtime, ...ARGS[runtime], './server.ts'], {
        cwd: import.meta.dir,
        env: {
          ...process.env,
          PORT: PORT[runtime] + ''
        }
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
start('bun');
