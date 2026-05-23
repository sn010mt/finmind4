const http = require('http');
const https = require('https');
const { Buffer } = require('buffer');
const { URL } = require('url');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3001;

const SMS_PROMPT_PREFIX =
  'Это SMS от Kaspi Bank. Извлеки транзакцию и верни ТОЛЬКО один JSON объект: { "date": "ДД.ММ.ГГГГ", "merchant": "название", "amount": число (отрицательное=расход), "category": "еда/транспорт/покупки/здоровье/развлечения/переводы/другое", "type": "expense/income" }. Только JSON без markdown. SMS: ';

const FINMIND_SMS_URL = 'https://finmind4-production.up.railway.app/sms';

/** @type {Array<Record<string, unknown>>} */
const pendingTransactions = [];

function buildFinMindShortcutPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>WFWorkflowActions</key>
	<array>
		<dict>
			<key>WFWorkflowActionIdentifier</key>
			<string>is.workflow.actions.downloadurl</string>
			<key>WFWorkflowActionParameters</key>
			<dict>
				<key>UUID</key>
				<string>F1N00001-0001-4000-8000-000000000001</string>
				<key>ShowHeaders</key>
				<true/>
				<key>ShowWhenRun</key>
				<false/>
				<key>WFHTTPMethod</key>
				<string>POST</string>
				<key>WFHTTPBodyType</key>
				<string>JSON</string>
				<key>WFURL</key>
				<string>${FINMIND_SMS_URL}</string>
				<key>WFHTTPHeaders</key>
				<dict>
					<key>Value</key>
					<dict>
						<key>WFDictionaryFieldValueItems</key>
						<array>
							<dict>
								<key>WFItemType</key>
								<integer>0</integer>
								<key>WFKey</key>
								<dict>
									<key>Value</key>
									<dict>
										<key>string</key>
										<string>Content-Type</string>
									</dict>
									<key>WFSerializationType</key>
									<string>WFTextTokenString</string>
								</dict>
								<key>WFValue</key>
								<dict>
									<key>Value</key>
									<dict>
										<key>string</key>
										<string>application/json</string>
									</dict>
									<key>WFSerializationType</key>
									<string>WFTextTokenString</string>
								</dict>
							</dict>
						</array>
					</dict>
					<key>WFSerializationType</key>
					<string>WFDictionaryFieldValue</string>
				</dict>
				<key>WFJSONValues</key>
				<dict>
					<key>Value</key>
					<dict>
						<key>WFDictionaryFieldValueItems</key>
						<array>
							<dict>
								<key>WFItemType</key>
								<integer>0</integer>
								<key>WFKey</key>
								<dict>
									<key>Value</key>
									<dict>
										<key>string</key>
										<string>text</string>
									</dict>
									<key>WFSerializationType</key>
									<string>WFTextTokenString</string>
								</dict>
								<key>WFValue</key>
								<dict>
									<key>Value</key>
									<dict>
										<key>Type</key>
										<string>ExtensionInput</string>
									</dict>
									<key>WFSerializationType</key>
									<string>WFTextTokenAttachment</string>
								</dict>
							</dict>
						</array>
					</dict>
					<key>WFSerializationType</key>
					<string>WFDictionaryFieldValue</string>
				</dict>
			</dict>
		</dict>
	</array>
	<key>WFWorkflowClientRelease</key>
	<string>3.0.0</string>
	<key>WFWorkflowClientVersion</key>
	<string>2302.0.4</string>
	<key>WFWorkflowHasShortcutInputVariables</key>
	<true/>
	<key>WFWorkflowIcon</key>
	<dict>
		<key>WFWorkflowIconGlyphNumber</key>
		<integer>59511</integer>
		<key>WFWorkflowIconStartColor</key>
		<integer>463140863</integer>
	</dict>
	<key>WFWorkflowImportQuestions</key>
	<array/>
	<key>WFWorkflowInputContentItemClasses</key>
	<array>
		<string>WFStringContentItem</string>
	</array>
	<key>WFWorkflowMinimumClientVersion</key>
	<integer>900</integer>
	<key>WFWorkflowMinimumClientVersionString</key>
	<string>900</string>
	<key>WFWorkflowName</key>
	<string>FinMind</string>
	<key>WFWorkflowOutputContentItemClasses</key>
	<array/>
	<key>WFWorkflowTriggers</key>
	<array>
		<dict>
			<key>WFTriggerType</key>
			<string>Messages</string>
			<key>WFTriggerFilter</key>
			<dict>
				<key>Value</key>
				<dict>
					<key>WFActionParameterFilterPrefix</key>
					<integer>1</integer>
					<key>WFContentPredicateBoundedDate</key>
					<false/>
					<key>WFActionParameterFilterTemplates</key>
					<array>
						<dict>
							<key>Operator</key>
							<integer>99</integer>
							<key>Property</key>
							<string>Sender</string>
							<key>Removable</key>
							<true/>
							<key>Values</key>
							<dict>
								<key>String</key>
								<string>Kaspi</string>
								<key>Unit</key>
								<integer>4</integer>
							</dict>
						</dict>
					</array>
				</dict>
				<key>WFSerializationType</key>
				<string>WFContentPredicateTableTemplate</string>
			</dict>
		</dict>
	</array>
	<key>WFWorkflowTypes</key>
	<array/>
</dict>
</plist>
`;
}

function handlePending(res) {
  const batch = pendingTransactions.splice(0);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ transactions: batch }));
}

function handleShortcut(res) {
  const plist = buildFinMindShortcutPlist();
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': 'attachment; filename="FinMind.shortcut"',
    'Content-Length': Buffer.byteLength(plist, 'utf8'),
  });
  res.end(plist);
}

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
      pendingTransactions.push(transaction);
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

    const pathname = new URL(req.url, 'http://localhost').pathname;

    if (req.method === 'GET' && pathname === '/shortcut') {
      handleShortcut(res);
      return;
    }

    if (req.method === 'GET' && pathname === '/pending') {
      handlePending(res);
      return;
    }

    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      try {
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
