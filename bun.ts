const a = new Request('http://localhost:3000', {
  method: 'POST',
  body: JSON.stringify({}),
});

await a.text();
await a.text();
