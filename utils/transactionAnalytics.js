import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  getCategoryColor,
} from './categoryIcons';
import { formatMerchantName } from './formatMerchantName';

const AMOUNT_TOLERANCE_RATIO = 0.08;
const MIN_RECURRING_PAYMENTS = 2;

function parseTransactionDate(dateValue) {
  if (!dateValue) {
    return new Date();
  }

  const parsed = new Date(dateValue);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const match = String(dateValue).match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    return new Date(year, month, day);
  }

  return new Date();
}

function isCurrentMonth(date, reference = new Date()) {
  return (
    date.getMonth() === reference.getMonth() &&
    date.getFullYear() === reference.getFullYear()
  );
}

function normalizeMerchantKey(name) {
  return formatMerchantName(name).toLowerCase();
}

function amountsAreSimilar(amountA, amountB) {
  const absA = Math.abs(amountA);
  const absB = Math.abs(amountB);
  const avg = (absA + absB) / 2;
  const diff = Math.abs(absA - absB);

  return diff <= avg * AMOUNT_TOLERANCE_RATIO || diff < 500;
}

function formatPaymentsRemaining(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `найден ${count} платёж`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `найдено ${count} платежа`;
  }

  return `найдено ${count} платежей`;
}

function getMonthTransactions(transactions, reference = new Date()) {
  return transactions.filter((tx) =>
    isCurrentMonth(parseTransactionDate(tx.date), reference),
  );
}

function getTransactionAmount(tx) {
  return Math.abs(Math.round(tx.amount));
}

function isIncomeTransaction(tx) {
  return String(tx.type || '').toLowerCase() === 'income';
}

function isExpenseTransaction(tx) {
  return String(tx.type || '').toLowerCase() === 'expense' || tx.amount < 0;
}

function normalizeCategoryKey(category) {
  const key = String(category || 'other').toLowerCase();
  if (key === 'other' || key === 'другое') {
    return 'другое';
  }
  return key;
}

export function calculateFreeMoney(transactions, reference = new Date()) {
  const totalIncome = transactions
    .filter(isIncomeTransaction)
    .reduce((sum, tx) => sum + getTransactionAmount(tx), 0);

  const totalExpenses = transactions
    .filter(isExpenseTransaction)
    .reduce((sum, tx) => sum + getTransactionAmount(tx), 0);

  const freeMoney = totalIncome - totalExpenses;

  const lastDay = new Date(
    reference.getFullYear(),
    reference.getMonth() + 1,
    0,
  ).getDate();
  const daysLeft = Math.max(1, lastDay - reference.getDate());
  const dailyLimit = freeMoney > 0 ? Math.round(freeMoney / daysLeft) : 0;

  return { freeMoney, dailyLimit };
}

export function getRecentTransactions(transactions, limit = 5) {
  return [...transactions]
    .sort(
      (a, b) =>
        parseTransactionDate(b.date).getTime() -
        parseTransactionDate(a.date).getTime(),
    )
    .slice(0, limit);
}

export function detectRecurringDebts(transactions) {
  return [];
}

function filterTransactionsByPeriod(
  transactions,
  period,
  reference = new Date(),
) {
  return transactions.filter((tx) => {
    const date = parseTransactionDate(tx.date);

    if (period === 'week') {
      const weekAgo = new Date(reference);
      weekAgo.setDate(reference.getDate() - 7);
      weekAgo.setHours(0, 0, 0, 0);
      return date >= weekAgo && date <= reference;
    }

    if (period === 'year') {
      return date.getFullYear() === reference.getFullYear();
    }

    return isCurrentMonth(date, reference);
  });
}

export function getCategorySpending(
  transactions,
  period = 'month',
  reference = new Date(),
) {
  const periodTransactions = filterTransactionsByPeriod(
    transactions,
    period,
    reference,
  );
  const expenses = periodTransactions.filter(isExpenseTransaction);
  const totalsByCategory = {};

  expenses.forEach((tx) => {
    const category = normalizeCategoryKey(tx.category);
    totalsByCategory[category] =
      (totalsByCategory[category] || 0) + getTransactionAmount(tx);
  });

  const totalExpense = Object.values(totalsByCategory).reduce(
    (sum, value) => sum + value,
    0,
  );

  return Object.entries(totalsByCategory)
    .map(([category, amount]) => ({
      id: category,
      category,
      name: CATEGORY_LABELS[category] || CATEGORY_LABELS.other,
      emoji: CATEGORY_ICONS[category] || CATEGORY_ICONS.other,
      amount,
      percent:
        totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0,
      color: getCategoryColor(category),
    }))
    .sort((a, b) => b.amount - a.amount);
}

export function getTopCategoryInsight(transactions, reference = new Date()) {
  const monthExpenses = getMonthTransactions(transactions, reference).filter(
    (tx) => tx.type === 'EXPENSE' || tx.amount < 0,
  );

  if (!monthExpenses.length) {
    return null;
  }

  const totalsByCategory = {};

  monthExpenses.forEach((tx) => {
    const category = tx.category || 'other';
    totalsByCategory[category] =
      (totalsByCategory[category] || 0) + getTransactionAmount(tx);
  });

  const totalExpense = Object.values(totalsByCategory).reduce(
    (sum, value) => sum + value,
    0,
  );

  const topCategory = Object.entries(totalsByCategory).sort(
    (a, b) => b[1] - a[1],
  )[0];

  if (!topCategory || totalExpense === 0) {
    return null;
  }

  const [category, amount] = topCategory;
  const percent = Math.round((amount / totalExpense) * 100);
  const label = CATEGORY_LABELS[category] || CATEGORY_LABELS.other;

  return {
    text: `На ${label.toLowerCase()} ушло ${amount.toLocaleString('ru-RU')} ₸ за месяц — это ${percent}% всех трат`,
    category: label,
    amount,
    percent,
  };
}

export function getDebtSummary(debts, monthlyIncome) {
  const totalMonthly = debts.reduce((sum, debt) => sum + debt.monthlyAmount, 0);
  const incomePercent =
    monthlyIncome > 0 ? Math.round((totalMonthly / monthlyIncome) * 100) : 0;

  return {
    totalMonthly,
    incomePercent,
    label: `Итого в месяц: ${totalMonthly.toLocaleString('ru-RU')} ₸ — ${incomePercent}% дохода`,
  };
}
