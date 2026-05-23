export const CATEGORY_ICONS = {
  groceries: '🛒',
  restaurant: '🍔',
  transport: '🚕',
  health: '💊',
  salary: '💰',
  other: '⚪',
  еда: '🍔',
  транспорт: '🚕',
  покупки: '🛍',
  здоровье: '💊',
  развлечения: '🎬',
  переводы: '💸',
  другое: '⚪',
};

export const ANALYTICS_CATEGORY_COLOR_MAP = {
  покупки: '#9B59B6',
  другое: '#95A5A6',
  еда: '#E67E22',
  транспорт: '#3498DB',
  здоровье: '#E74C3C',
  развлечения: '#FF69B4',
  переводы: '#1ABC9C',
};

export const CATEGORY_COLORS = {
  ...ANALYTICS_CATEGORY_COLOR_MAP,
  groceries: '#E67E22',
  restaurant: '#E67E22',
  transport: '#3498DB',
  health: '#E74C3C',
  other: '#95A5A6',
};

export const CATEGORY_NAME_COLORS = {
  Покупки: '#9B59B6',
  Другое: '#95A5A6',
  Еда: '#E67E22',
  Транспорт: '#3498DB',
  Здоровье: '#E74C3C',
  Развлечения: '#FF69B4',
  Переводы: '#1ABC9C',
  Продукты: '#E67E22',
  Рестораны: '#E67E22',
};

export const CATEGORY_LABELS = {
  groceries: 'Продукты',
  restaurant: 'Рестораны',
  transport: 'Транспорт',
  health: 'Здоровье',
  salary: 'Зарплата',
  other: 'Другое',
  еда: 'Еда',
  транспорт: 'Транспорт',
  покупки: 'Покупки',
  здоровье: 'Здоровье',
  развлечения: 'Развлечения',
  переводы: 'Переводы',
  другое: 'Другое',
};

const LABEL_TO_CATEGORY_KEY = Object.fromEntries(
  Object.entries(CATEGORY_LABELS).map(([key, label]) => [label, key]),
);

export function getCategoryColor(categoryOrName) {
  const raw = String(categoryOrName || '').trim();
  if (!raw) {
    return ANALYTICS_CATEGORY_COLOR_MAP.другое;
  }

  const key = raw.toLowerCase();
  if (ANALYTICS_CATEGORY_COLOR_MAP[key]) {
    return ANALYTICS_CATEGORY_COLOR_MAP[key];
  }
  if (CATEGORY_COLORS[key]) {
    return CATEGORY_COLORS[key];
  }
  if (CATEGORY_NAME_COLORS[raw]) {
    return CATEGORY_NAME_COLORS[raw];
  }

  const mappedKey = LABEL_TO_CATEGORY_KEY[raw];
  if (mappedKey && ANALYTICS_CATEGORY_COLOR_MAP[mappedKey]) {
    return ANALYTICS_CATEGORY_COLOR_MAP[mappedKey];
  }

  return ANALYTICS_CATEGORY_COLOR_MAP.другое;
}

export function mapParsedTransactions(parsed) {
  return parsed.map((item, index) => {
    const numericAmount = Number(item.amount);
    const normalizedType = String(item.type || '').toLowerCase();
    const type =
      normalizedType === 'income' || normalizedType === 'INCOME'
        ? 'INCOME'
        : normalizedType === 'expense' || normalizedType === 'EXPENSE'
          ? 'EXPENSE'
          : numericAmount >= 0
            ? 'INCOME'
            : 'EXPENSE';

    return {
      id: String(Date.now() + index),
      name: item.merchant || 'Без названия',
      amount: numericAmount,
      date: item.date || new Date().toISOString(),
      category: item.category || 'other',
      type,
      icon: CATEGORY_ICONS[item.category] || CATEGORY_ICONS.other,
    };
  });
}
