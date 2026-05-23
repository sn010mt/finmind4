import * as FileSystem from 'expo-file-system/legacy';
import { mapParsedTransactions } from '../utils/categoryIcons';

const PROXY_URL = 'http://172.20.10.3:3001';

export async function parseKaspiStatementFromPdf(fileUri, fileName) {
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: 'base64',
  });

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, fileName }),
  });

  if (!response.ok) throw new Error('Ошибка сервера: ' + response.status);

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Ошибка: ' + JSON.stringify(data));

  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const transactions = JSON.parse(cleaned.slice(cleaned.indexOf('['), cleaned.lastIndexOf(']') + 1));
  return mapParsedTransactions(transactions);
}
