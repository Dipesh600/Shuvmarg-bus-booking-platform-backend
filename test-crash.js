const http = require('http');

async function test() {
  const reqs = [
    'http://localhost:7012/admin/operator-config/65d8a9b2b2b3a1a1c8b3d001',
    'http://localhost:7012/admin/brands/65d8a9b2b2b3a1a1c8b3d001/route-services',
  ];
  for (const url of reqs) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      console.log(url, res.status, text.slice(0, 100));
    } catch (e) {
      console.log("Fetch failed", url, e.message);
    }
  }
}
test();
