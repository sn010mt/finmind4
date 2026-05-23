import * as FileSystem from 'expo-file-system/legacy';
import { mapParsedTransactions } from '../utils/categoryIcons';

const PROXY_URL = 'https://finmind4-production.up.railway.app';

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
  const content = data.content?.[0]?.text;
  if (!content) throw new Error('Ошибка: ' + JSON.stringify(data));

  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const transactions = JSON.parse(cleaned.slice(cleaned.indexOf('['), cleaned.lastIndexOf(']') + 1));
  return mapParsedTransactions(transactions);
}
