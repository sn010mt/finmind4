import * as FileSystem from 'expo-file-system/legacy';
import { mapParsedTransactions } from '../utils/categoryIcons';

const PROXY_URL = 'https://finmind4-production.up.railway.app';

export async function parseKaspiStatementFromPdf(fileUri, fileName) {
  const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, fileName }),
  });

  const raw = await response.text();
  const data = JSON.parse(raw);
  const content = data?.content?.[0]?.text || data?.choices?.[0]?.message?.content || '';
  
  // Strip markdown
  let cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim();
  
  // Find JSON array
  const start = cleaned.indexOf('[');
  if (start === -1) throw new Error('Нет данных');
  cleaned = cleaned.slice(start);
  
  // Fix truncated JSON by finding last complete object
  let end = cleaned.lastIndexOf('}]');
  if (end === -1) end = cleaned.lastIndexOf('}');
  if (end === -1) throw new Error('Нет данных');
  cleaned = cleaned.slice(0, end + 1);
  if (!cleaned.endsWith(']')) cleaned += ']';
  
  const transactions = JSON.parse(cleaned);
  return mapParsedTransactions(transactions);
}
