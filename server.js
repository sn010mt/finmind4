const http = require('http');
const https = require('https');
const { Buffer } = require('buffer');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3001;

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    try {
      const { base64, fileName } = JSON.parse(body);

      const payload = JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64,
              }
            },
            {
              type: 'text',
              text: 'Извлеки ВСЕ транзакции из этой банковской выписки Kaspi Bank. Верни ТОЛЬКО чистый JSON массив без markdown и объяснений: [{ "date": "ДД.ММ.ГГГГ", "merchant": "полное название", "amount": число (отрицательное=расход), "category": "еда/транспорт/покупки/здоровье/развлечения/переводы/другое", "type": "expense/income" }]'
            }
          ]
        }]
      });

      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'pdfs-2024-09-25',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 120000,
      };

      const r = https.request(options, openAIRes => {
        let data = '';
        openAIRes.on('data', c => data += c);
        openAIRes.on('end', () => {
          console.log('Anthropic:', data.slice(0, 300));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(data);
        });
      });

      r.on('error', e => {
        console.error(e);
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      });

      r.write(payload);
      r.end();
    } catch(e) {
      console.error(e);
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
  });
}).listen(PORT, '0.0.0.0', () => console.log('Сервер запущен на порту ' + PORT));
