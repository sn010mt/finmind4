require('dotenv').config();

const http = require('http');
const https = require('https');
const { Buffer } = require('buffer');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
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
        model: 'gpt-4o-mini',
        max_tokens: 8000,
        temperature: 0,
        messages: [{
          role: 'user',
          content: [
            { type: 'file', file: { filename: fileName || 'kaspi.pdf', file_data: `data:application/pdf;base64,${base64}` } },
            { type: 'text', text: 'Ты парсер банковских выписок Kaspi Bank. Извлеки ВСЕ транзакции и верни ТОЛЬКО JSON массив. Правила: 1) Покупки в магазинах, кафе, сервисах — type: "expense", amount отрицательное число. 2) Поступления зарплаты, переводы от людей на твой счёт — type: "income", amount положительное. 3) Переводы между людьми где ты платишь — type: "expense", amount отрицательное. 4) Пиши полные названия мерчантов без обрезания, например \'Penguin Laundry\' а не \'Penguin Laundr\'. Если название на английском — пиши его полностью как есть в выписке. Формат: [{ "date": "ДД.ММ.ГГГГ", "merchant": "строка", "amount": число, "category": "еда/транспорт/покупки/здоровье/развлечения/переводы/другое", "type": "expense/income" }]. Только JSON массив. Не используй markdown, не оборачивай в json. Верни ТОЛЬКО чистый JSON массив начиная с [ и заканчивая ]. Год пиши полностью: 2026, не 26.' }
          ]
        }]
      });

      const options = {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 300000,
      };

      const r = https.request(options, openAIRes => {
        let data = '';
        openAIRes.on('data', c => data += c);
        openAIRes.on('end', () => {
          console.log('OpenAI:', data.slice(0, 300));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(data);
        });
      });

      r.on('error', e => { console.error(e); res.writeHead(500); res.end(JSON.stringify({ error: e.message })); });
      r.write(payload);
      r.end();
    } catch(e) {
      console.error(e);
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
  });
}).listen(PORT, '0.0.0.0', () => console.log('Сервер запущен на порту ' + PORT));
