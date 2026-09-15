import { createServer } from 'node:http'
const messages = []
const server = createServer(async (req, res) => {
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  // Local test infrastructure, bound to loopback. Reject browser cross-origin requests.
  if (req.headers.origin && req.headers.origin !== 'http://127.0.0.1:8025') {
    res.writeHead(403)
    res.end()
    return
  }
  const url = new URL(req.url, 'http://127.0.0.1:8025')
  if (req.method === 'POST' && url.pathname === '/messages') {
    let body = ''
    for await (const chunk of req) {
      body += chunk
      if (body.length > 100_000) {
        res.writeHead(413)
        res.end()
        return
      }
    }
    try {
      const email = JSON.parse(body)
      messages.push({ ...email, receivedAt: new Date().toISOString() })
      if (messages.length > 200) messages.shift()
      res.writeHead(201)
      res.end('{}')
    } catch {
      res.writeHead(400)
      res.end('{}')
    }
    return
  }
  if (req.method === 'GET' && url.pathname === '/messages') {
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify(
        messages.filter((m) => !url.searchParams.get('to') || m.to === url.searchParams.get('to')),
      ),
    )
    return
  }
  if (req.method === 'GET' && url.pathname === '/') {
    res.setHeader('content-type', 'text/html')
    res.end(
      `<!doctype html><html lang="en"><title>Rekann local inbox</title><style>body{font:14px system-ui;max-width:800px;margin:40px auto;padding:20px}article{border:1px solid #ddd;padding:20px;margin:15px 0;border-radius:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere}button{padding:8px}</style><h1>Rekann local inbox</h1><p>Development email only. Messages disappear when the server stops.</p><button onclick="location.reload()">Refresh inbox</button><main></main><script>fetch('/messages').then(r=>r.json()).then(messages=>messages.reverse().forEach(m=>{const a=document.createElement('article');const h=document.createElement('h2');h.textContent=m.subject;const p=document.createElement('p');p.textContent=m.to;const t=document.createElement('pre');t.textContent=m.text;a.append(h,p,t);document.querySelector('main').append(a)}))</script></html>`,
    )
    return
  }
  res.writeHead(404)
  res.end()
})
server.listen(8025, '127.0.0.1', () =>
  console.log('Local inbox: http://127.0.0.1:8025 (messages stay in memory)'),
)
