const http = require('http');
const https = require('https');
const { Buffer } = require('buffer');
const { URL } = require('url');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3001;

const SMS_PROMPT_PREFIX =
  'Это SMS от Kaspi Bank. Извлеки транзакцию и верни ТОЛЬКО один JSON объект: { "date": "ДД.ММ.ГГГГ", "merchant": "название", "amount": число (отрицательное=расход), "category": "еда/транспорт/покупки/здоровье/развлечения/переводы/другое", "type": "expense/income" }. Только JSON без markdown. SMS: ';

function callAnthropic(payload, { pdfBeta = false } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    };
    if (pdfBeta) headers['anthropic-beta'] = 'pdfs-2024-09-25';

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers,
      timeout: 120000,
    };

    const r = https.request(options, anthropicRes => {
      let data = '';
      anthropicRes.on('data', c => (data += c));
      anthropicRes.on('end', () => {
        if (anthropicRes.statusCode < 200 || anthropicRes.statusCode >= 300) {
          reject(new Error(`Anthropic ${anthropicRes.statusCode}: ${data.slice(0, 300)}`));
          return;
        }
        resolve(data);
      });
    });

    r.on('error', reject);
    r.on('timeout', () => {
      r.destroy();
      reject(new Error('Anthropic request timed out'));
    });
    r.write(payload);
    r.end();
  });
}

function parseTransactionJson(anthropicBody) {
  const data = JSON.parse(anthropicBody);
  const content = data?.content?.[0]?.text || '';
  let cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  if (start === -1) throw new Error('No transaction in response');
  cleaned = cleaned.slice(start);
  const end = cleaned.lastIndexOf('}');
  if (end === -1) throw new Error('No transaction in response');
  return JSON.parse(cleaned.slice(0, end + 1));
}

function handleSms(res, body) {
  const { text } = JSON.parse(body);
  if (!text) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing text' }));
    return;
  }

  const payload = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: SMS_PROMPT_PREFIX + text,
      },
    ],
  });

  callAnthropic(payload)
    .then(data => {
      console.log('Anthropic SMS:', data.slice(0, 300));
      const transaction = parseTransactionJson(data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(transaction));
    })
    .catch(e => {
      console.error(e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    });
}

function handlePdf(res, body) {
  const { base64, fileName } = JSON.parse(body);

  const payload = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64,
            },
          },
          {
            type: 'text',
            text: 'Извлеки ВСЕ транзакции из этой банковской выписки Kaspi Bank. Верни ТОЛЬКО чистый JSON массив без markdown и объяснений: [{ "date": "ДД.ММ.ГГГГ", "merchant": "полное название", "amount": число (отрицательное=расход), "category": "еда/транспорт/покупки/здоровье/развлечения/переводы/другое", "type": "expense/income" }]',
          },
        ],
      },
    ],
  });

  callAnthropic(payload, { pdfBeta: true })
    .then(data => {
      console.log('Anthropic:', data.slice(0, 300));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    })
    .catch(e => {
      console.error(e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    });
}

http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      try {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname === '/sms') {
          handleSms(res, body);
        } else {
          handlePdf(res, body);
        }
      } catch (e) {
        console.error(e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  })
  .listen(PORT, '0.0.0.0', () => console.log('Сервер запущен на порту ' + PORT));
