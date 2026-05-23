import { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { parseKaspiStatementFromPdf } from './services/parseKaspiStatement';
import { CATEGORY_LABELS } from './utils/categoryIcons';
import { formatMerchantName } from './utils/formatMerchantName';
import {
  detectRecurringDebts,
  getCategorySpending,
  getDebtSummary,
  getRecentTransactions,
  getTopCategoryInsight,
} from './utils/transactionAnalytics';

const DEFAULT_TRANSACTIONS = [
  {
    id: '1',
    name: 'Magnum',
    amount: -8400,
    icon: '🛒',
    date: '2026-05-18',
    category: 'groceries',
    type: 'EXPENSE',
  },
  {
    id: '2',
    name: 'Зарплата',
    amount: 420000,
    icon: '💰',
    date: '2026-05-01',
    category: 'salary',
    type: 'INCOME',
  },
  {
    id: '3',
    name: 'Coffeemania',
    amount: -2200,
    icon: '☕',
    date: '2026-05-17',
    category: 'restaurant',
    type: 'EXPENSE',
  },
  {
    id: '4',
    name: 'Яндекс Такси',
    amount: -3400,
    icon: '🚕',
    date: '2026-05-16',
    category: 'transport',
    type: 'EXPENSE',
  },
  {
    id: '5',
    name: 'Burger King',
    amount: -4100,
    icon: '🍔',
    date: '2026-05-15',
    category: 'restaurant',
    type: 'EXPENSE',
  },
  {
    id: '6',
    name: 'Аптека Europharma',
    amount: -6800,
    icon: '💊',
    date: '2026-05-14',
    category: 'health',
    type: 'EXPENSE',
  },
  {
    id: '7',
    name: 'Beeline',
    amount: -5500,
    icon: '📱',
    date: '2026-05-13',
    category: 'other',
    type: 'EXPENSE',
  },
  {
    id: '8',
    name: 'Lamoda',
    amount: -24900,
    icon: '🛍',
    date: '2026-05-12',
    category: 'other',
    type: 'EXPENSE',
  },
];

const TRANSACTIONS_STORAGE_KEY = 'transactions';

const PERIODS = [
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'year', label: 'Год' },
];

const TABS = [
  { id: 'home', icon: '🏠', label: 'Главная' },
  { id: 'operations', icon: '💳', label: 'Операции' },
  { id: 'analytics', icon: '📊', label: 'Аналитика' },
  { id: 'settings', icon: '⚙️', label: 'Настройки' },
];

const AI_INSIGHT_STORAGE_KEY = 'ai_insight';
const CURRENT_BALANCE_STORAGE_KEY = 'currentBalance';

function parseBalanceInput(text) {
  const digits = String(text).replace(/\s/g, '').replace(/[^\d]/g, '');
  if (!digits) {
    return null;
  }
  return Number(digits);
}

function getDaysLeftInMonth(reference = new Date()) {
  const lastDay = new Date(
    reference.getFullYear(),
    reference.getMonth() + 1,
    0,
  ).getDate();
  return Math.max(1, lastDay - reference.getDate());
}

function generateInsight(transactions) {
  return getTopCategoryInsight(transactions);
}

async function persistAiInsight(insight) {
  try {
    if (insight) {
      await AsyncStorage.setItem(AI_INSIGHT_STORAGE_KEY, JSON.stringify(insight));
    } else {
      await AsyncStorage.removeItem(AI_INSIGHT_STORAGE_KEY);
    }
  } catch (error) {
    console.error('Failed to persist AI insight:', error);
  }
}

function formatAmount(amount) {
  const rounded = Math.round(amount);
  const sign = rounded > 0 ? '+' : '-';
  const value = Math.abs(rounded).toLocaleString('ru-RU');
  return `${sign}${value} ₸`;
}

function formatTenge(amount) {
  return `${Math.round(amount).toLocaleString('ru-RU')} ₸`;
}

function mergeCategoriesByName(categories) {
  const mergedMap = new Map();

  categories.forEach((cat) => {
    const existing = mergedMap.get(cat.name);
    if (existing) {
      existing.amount += cat.amount;
    } else {
      mergedMap.set(cat.name, { ...cat });
    }
  });

  const merged = Array.from(mergedMap.values());
  const total = merged.reduce((sum, cat) => sum + cat.amount, 0);

  return merged
    .map((cat) => ({
      ...cat,
      id: cat.name,
      color: getColor(cat.category || cat.name),
      percent: total > 0 ? Math.round((cat.amount / total) * 100) : 0,
    }))
    .sort((a, b) => b.percent - a.percent);
}

const CATEGORY_COLOR_MAP = {
  покупки: '#9B59B6',
  другое: '#95A5A6',
  еда: '#E67E22',
  транспорт: '#3498DB',
  переводы: '#1ABC9C',
  здоровье: '#E74C3C',
  развлечения: '#FF69B4',
};

const DISPLAY_LABEL_TO_KEY = Object.fromEntries(
  Object.entries(CATEGORY_LABELS).map(([key, label]) => [label.toLowerCase(), key]),
);

const LEGACY_CATEGORY_ALIASES = {
  groceries: 'еда',
  restaurant: 'еда',
  transport: 'транспорт',
  health: 'здоровье',
  other: 'другое',
};

function resolveCategoryKey(categoryName) {
  const raw = String(categoryName || '').trim();
  const lowered = raw.toLowerCase();

  if (CATEGORY_COLOR_MAP[lowered]) {
    return lowered;
  }

  if (LEGACY_CATEGORY_ALIASES[lowered]) {
    return LEGACY_CATEGORY_ALIASES[lowered];
  }

  if (DISPLAY_LABEL_TO_KEY[lowered]) {
    return DISPLAY_LABEL_TO_KEY[lowered];
  }

  return 'другое';
}

function getColor(categoryName) {
  return CATEGORY_COLOR_MAP[resolveCategoryKey(categoryName)];
}

const DONUT_SIZE = 200;
const DONUT_CENTER = DONUT_SIZE / 2;
const DONUT_OUTER_RADIUS = 100;
const DONUT_INNER_RADIUS = 64;

function polarToCartesian(cx, cy, radius, angleDeg) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}

function createDonutSlicePath(cx, cy, outerR, innerR, startAngle, sweepAngle) {
  if (sweepAngle <= 0) {
    return '';
  }

  const endAngle = startAngle + sweepAngle;
  const outerStart = polarToCartesian(cx, cy, outerR, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerR, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerR, endAngle);
  const innerStart = polarToCartesian(cx, cy, innerR, startAngle);
  const largeArc = sweepAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

function DonutChart({ categories }) {
  const sorted = [...categories].sort((a, b) => b.percent - a.percent);
  const totalPercent = sorted.reduce((sum, cat) => sum + cat.percent, 0);

  if (totalPercent === 0) {
    return null;
  }

  let startAngle = -90;
  const slices = sorted.map((cat) => {
    const categoryKey = cat.category || cat.id;
    const sweepAngle = Math.min((cat.percent / totalPercent) * 360, 359.999);
    const slice = {
      key: categoryKey,
      color: getColor(categoryKey),
      startAngle,
      sweepAngle,
      path:
        sweepAngle > 0
          ? createDonutSlicePath(
              DONUT_CENTER,
              DONUT_CENTER,
              DONUT_OUTER_RADIUS,
              DONUT_INNER_RADIUS,
              startAngle,
              sweepAngle,
            )
          : '',
    };
    startAngle += sweepAngle;
    return slice;
  });

  return (
    <View style={styles.donutChartWrap}>
      <Svg width={DONUT_SIZE} height={DONUT_SIZE}>
        {slices.map((slice) =>
          slice.path ? (
            <Path key={slice.key} d={slice.path} fill={slice.color} />
          ) : null,
        )}
      </Svg>
    </View>
  );
}

function BalanceModal({ visible, onClose, onSave }) {
  const [balanceInput, setBalanceInput] = useState('');

  useEffect(() => {
    if (visible) {
      setBalanceInput('');
    }
  }, [visible]);

  const handleSave = () => {
    const parsed = parseBalanceInput(balanceInput);
    if (parsed == null || parsed <= 0) {
      Alert.alert('Ошибка', 'Введите корректную сумму');
      return;
    }
    onSave(parsed);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Какой у тебя баланс в Kaspi?</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="130 000"
            placeholderTextColor="#666666"
            value={balanceInput}
            onChangeText={setBalanceInput}
            keyboardType="numeric"
          />
          <Pressable style={styles.modalButton} onPress={handleSave}>
            <Text style={styles.modalButtonText}>Сохранить</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

async function pickAndParseKaspiPdf() {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  const file = result.assets[0];
  return parseKaspiStatementFromPdf(file.uri, file.name);
}

const CYRILLIC_TO_LATIN = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ы: 'y',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

function normalizeForSearch(text) {
  return text
    .toLowerCase()
    .split('')
    .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
    .join('')
    .replace(/\s+/g, '');
}

function isSubsequenceMatch(text, query) {
  let queryIndex = 0;
  for (let i = 0; i < text.length && queryIndex < query.length; i++) {
    if (text[i] === query[queryIndex]) {
      queryIndex++;
    }
  }
  return queryIndex === query.length;
}

function matchesSearch(name, query) {
  const normalizedQuery = normalizeForSearch(query.trim());
  if (!normalizedQuery) {
    return true;
  }

  const normalizedName = normalizeForSearch(name);

  const isMatch = (value) =>
    normalizedName.includes(value) || isSubsequenceMatch(normalizedName, value);

  if (isMatch(normalizedQuery)) {
    return true;
  }

  if (normalizedQuery.length > 3) {
    return isMatch(normalizedQuery.slice(0, -1));
  }

  return false;
}

function TransactionCard({ tx }) {
  const displayName = formatMerchantName(tx.name);
  const amountText = formatAmount(tx.amount);
  const isLongAmount = amountText.length > 12;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.txIcon}>
        <Text style={styles.txIconEmoji}>{tx.icon}</Text>
      </View>
      <View style={styles.cardContent}>
        <Text
          style={styles.storeName}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {displayName}
        </Text>
        <View style={styles.amountColumn}>
          <Text
            style={[
              styles.amount,
              isLongAmount && styles.amountCompact,
              tx.amount < 0 ? styles.expense : styles.income,
            ]}
            numberOfLines={1}
          >
            {amountText}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function HomeScreen({
  transactions,
  insight,
  currentBalance,
  onOpenBalanceModal,
  onDebtPress,
}) {
  const lastDay = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  }, []);
  const daysLeft = useMemo(() => getDaysLeftInMonth(), []);
  const dailyLimit = useMemo(() => {
    if (currentBalance == null || currentBalance <= 0) {
      return 0;
    }
    return Math.round(currentBalance / daysLeft);
  }, [currentBalance, daysLeft]);
  const lastIncomeAmount = useMemo(() => {
    const incomes = transactions
      .filter((tx) => String(tx.type || '').toLowerCase() === 'income')
      .sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
    if (!incomes.length) {
      return 0;
    }
    return Math.abs(Math.round(incomes[0].amount));
  }, [transactions]);
  const recentTransactions = useMemo(
    () => getRecentTransactions(transactions, 5),
    [transactions],
  );
  const debts = useMemo(() => detectRecurringDebts(transactions), [transactions]);
  const debtSummary = useMemo(
    () => getDebtSummary(debts, lastIncomeAmount),
    [debts, lastIncomeAmount],
  );

  return (
    <>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.titleIcon}>💚</Text>
          <Text style={styles.title}>FinMind</Text>
        </View>
        <Text style={styles.subtitle}>Твой личный финансист</Text>
      </View>

      <LinearGradient
        colors={['#0a3d1f', '#0d5c2e']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.balanceCard}
      >
        <Text style={styles.balanceLabel}>Свободные деньги</Text>
        {currentBalance != null ? (
          <>
            <View style={styles.balanceAmountRow}>
              <Text style={styles.balanceArrow}>
                {currentBalance >= 0 ? '↑' : '↓'}
              </Text>
              <Text style={styles.balanceAmount}>
                {formatTenge(currentBalance)}
              </Text>
            </View>
            <Text style={styles.balanceHint}>
              {formatTenge(dailyLimit)} в день до {lastDay}-го
            </Text>
          </>
        ) : (
          <Pressable onPress={onOpenBalanceModal}>
            <Text style={styles.balancePrompt}>Укажи баланс →</Text>
          </Pressable>
        )}
      </LinearGradient>

      <Text style={styles.sectionTitle}>Последние операции</Text>

      <View style={styles.list}>
        {recentTransactions.map((tx) => (
          <TransactionCard key={tx.id} tx={tx} />
        ))}
      </View>

      {insight && (
        <View style={styles.insightCard}>
          <Text style={styles.insightLabel}>💡 ИИ-инсайт</Text>
          <Text style={styles.insightText}>{insight.text}</Text>
          <Pressable
            onPress={() =>
              Alert.alert(
                'ИИ-инсайт',
                `${insight.category}: ${formatTenge(insight.amount)} (${insight.percent}% всех трат за месяц)`,
              )
            }
          >
            <Text style={styles.insightButton}>Подробнее →</Text>
          </Pressable>
        </View>
      )}

      {debts.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, styles.debtSectionTitle]}>
            Долговая карта
          </Text>

          <View style={styles.debtList}>
            {debts.map((debt) => (
              <Pressable
                key={debt.id}
                style={({ pressed }) => [
                  styles.debtCard,
                  pressed && styles.cardPressed,
                ]}
                onPress={() => onDebtPress(debt)}
              >
                <View style={styles.debtRow}>
                  <Text style={styles.debtName}>{debt.name}</Text>
                  <Text style={styles.debtAmount}>{debt.monthly}</Text>
                </View>
                <Text style={styles.debtRemaining}>{debt.remaining}</Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[styles.progressFill, { width: `${debt.progress}%` }]}
                  />
                </View>
              </Pressable>
            ))}
          </View>

          <Text style={styles.debtTotal}>{debtSummary.label}</Text>
        </>
      )}
    </>
  );
}

function AnalyticsScreen({ transactions: liveTransactions }) {
  const [activePeriod, setActivePeriod] = useState('month');
  const [transactions, setTransactions] = useState(liveTransactions ?? []);

  useEffect(() => {
    async function loadTransactions() {
      try {
        const stored = await AsyncStorage.getItem(TRANSACTIONS_STORAGE_KEY);
        if (stored) {
          setTransactions(JSON.parse(stored));
        }
      } catch (error) {
        console.error('Failed to load transactions for analytics:', error);
      }
    }

    loadTransactions();
  }, []);

  useEffect(() => {
    if (liveTransactions?.length) {
      setTransactions(liveTransactions);
    }
  }, [liveTransactions]);

  const categories = useMemo(
    () =>
      mergeCategoriesByName(getCategorySpending(transactions, activePeriod)),
    [transactions, activePeriod],
  );

  const topCategory = categories[0];
  const insightText = topCategory
    ? `Самая большая статья расходов — ${topCategory.name.toLowerCase()}: ${topCategory.amount.toLocaleString('ru-RU')} ₸ (${topCategory.percent}% всех трат).`
    : 'Нет данных о расходах за выбранный период. Загрузи выписку PDF в настройках.';

  return (
    <View style={styles.analyticsScreen}>
      <Text style={styles.analyticsTitle}>Аналитика</Text>

      <View style={styles.periodToggle}>
        {PERIODS.map((period) => {
          const isActive = activePeriod === period.id;
          return (
            <Pressable
              key={period.id}
              style={[
                styles.periodButton,
                isActive && styles.periodButtonActive,
              ]}
              onPress={() => setActivePeriod(period.id)}
            >
              <Text
                style={[
                  styles.periodButtonText,
                  isActive && styles.periodButtonTextActive,
                ]}
              >
                {period.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.chartBlock}>
        {categories.length === 0 ? (
          <Text style={styles.chartEmpty}>Нет расходов за выбранный период</Text>
        ) : (
          <>
            <DonutChart categories={categories} />
            <View style={styles.categoryList}>
              {categories.map((cat) => {
                const categoryKey = cat.category || cat.id;
                return (
                  <View key={cat.id} style={styles.categoryRow}>
                    <View style={styles.categoryRowLeft}>
                      <View
                        style={[
                          styles.categoryColorDot,
                          { backgroundColor: getColor(categoryKey) },
                        ]}
                      />
                      <Text style={styles.categoryName}>
                        {cat.emoji} {cat.name}
                      </Text>
                    </View>
                    <Text style={styles.categoryAmount}>
                      {formatTenge(cat.amount)} — {cat.percent}%
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </View>

      <View style={styles.analyticsInsightCard}>
        <Text style={styles.analyticsInsightText}>{insightText}</Text>
      </View>
    </View>
  );
}

function SettingsSection({ title, children }) {
  return (
    <View style={styles.settingsSection}>
      <Text style={styles.settingsSectionTitle}>{title}</Text>
      <View style={styles.settingsCard}>{children}</View>
    </View>
  );
}

function SettingsRow({ label, right, isLast }) {
  return (
    <View style={[styles.settingsRow, !isLast && styles.settingsRowBorder]}>
      <Text style={styles.settingsRowLabel}>{label}</Text>
      {right}
    </View>
  );
}

function SettingsScreen({ onTransactionsLoaded }) {
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [budgetAlerts, setBudgetAlerts] = useState(true);
  const [isParsingPdf, setIsParsingPdf] = useState(false);

  const handleKaspiUpload = async () => {
    try {
      setIsParsingPdf(true);
      const loadedTransactions = await pickAndParseKaspiPdf();
      if (!loadedTransactions) {
        return;
      }

      Alert.alert(`Загружено ${loadedTransactions.length} транзакций`);
      onTransactionsLoaded(loadedTransactions);
    } catch (error) {
      Alert.alert(
        'Ошибка',
        error instanceof Error ? error.message : 'Не удалось обработать выписку',
      );
    } finally {
      setIsParsingPdf(false);
    }
  };

  return (
    <>
      <Text style={styles.operationsTitle}>Настройки</Text>

      <View style={styles.profileBlock}>
        <View style={styles.avatar}>
          <Text style={styles.avatarEmoji}>👤</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>Санжар</Text>
          <Text style={styles.profileSub}>Pro подписка активна</Text>
        </View>
      </View>

      <SettingsSection title="Данные">
        <Pressable
          style={[styles.settingsRow, isParsingPdf && styles.buttonDisabled]}
          onPress={handleKaspiUpload}
          disabled={isParsingPdf}
        >
          <View style={styles.settingsRowLabelWrap}>
            <Text style={styles.settingsRowIcon}>📄</Text>
            <Text style={styles.settingsRowLabel}>Загрузить выписку PDF</Text>
          </View>
          {isParsingPdf ? (
            <ActivityIndicator color="#4CAF50" size="small" />
          ) : (
            <Text style={styles.settingsArrow}>→</Text>
          )}
        </Pressable>
      </SettingsSection>

      <SettingsSection title="Уведомления">
        <SettingsRow
          label="Еженедельный дайджест"
          right={
            <Switch
              value={weeklyDigest}
              onValueChange={setWeeklyDigest}
              trackColor={{ false: '#3a3a3a', true: '#4CAF50' }}
              thumbColor="#FFFFFF"
            />
          }
        />
        <SettingsRow
          label="Алерты по бюджету"
          isLast
          right={
            <Switch
              value={budgetAlerts}
              onValueChange={setBudgetAlerts}
              trackColor={{ false: '#3a3a3a', true: '#4CAF50' }}
              thumbColor="#FFFFFF"
            />
          }
        />
      </SettingsSection>

      <SettingsSection title="Безопасность">
        <SettingsRow
          label="Локальное хранение данных"
          right={<Text style={styles.settingsValueGray}>Включено</Text>}
        />
        <SettingsRow
          label="Экспорт данных CSV"
          isLast
          right={<Text style={styles.settingsArrow}>→</Text>}
        />
      </SettingsSection>

      <SettingsSection title="Подписка">
        <SettingsRow
          label="Pro план"
          isLast
          right={
            <Text style={styles.settingsValueGreen}>Активен до 21 июня</Text>
          }
        />
      </SettingsSection>

      <SettingsSection title="О приложении">
        <SettingsRow
          label="Версия"
          isLast
          right={<Text style={styles.settingsValueGray}>1.0.0</Text>}
        />
      </SettingsSection>
    </>
  );
}

function OperationsScreen({ searchQuery, onSearchChange, transactions }) {
  return (
    <>
      <Text style={styles.operationsTitle}>Операции</Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Поиск по операциям..."
        placeholderTextColor="#666666"
        value={searchQuery}
        onChangeText={onSearchChange}
      />

      <Text style={styles.monthLabel}>Май 2026</Text>

      <View style={styles.list}>
        {transactions.map((tx) => (
          <TransactionCard key={tx.id} tx={tx} />
        ))}
      </View>
    </>
  );
}

const ONBOARDING_STEPS = 4;

function OnboardingDots({ step }) {
  return (
    <View style={styles.onboardingDots}>
      {Array.from({ length: ONBOARDING_STEPS }, (_, index) => (
        <View
          key={index}
          style={[styles.onboardingDot, index === step && styles.onboardingDotActive]}
        />
      ))}
    </View>
  );
}

function Onboarding({ step, onNext, onComplete, onCompleteWithTransactions }) {
  const [smsText, setSmsText] = useState('');
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const analyzeTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (analyzeTimeoutRef.current) {
        clearTimeout(analyzeTimeoutRef.current);
      }
    };
  }, []);

  const handleAnalyze = () => {
    Alert.alert('ИИ анализирует ваши данные...');
    analyzeTimeoutRef.current = setTimeout(() => {
      onComplete();
    }, 2000);
  };

  const handleKaspiUpload = async () => {
    try {
      setIsParsingPdf(true);
      const transactions = await pickAndParseKaspiPdf();
      if (!transactions) {
        return;
      }

      Alert.alert(`Загружено ${transactions.length} транзакций`);
      onCompleteWithTransactions(transactions);
    } catch (error) {
      Alert.alert(
        'Ошибка',
        error instanceof Error ? error.message : 'Не удалось обработать выписку',
      );
    } finally {
      setIsParsingPdf(false);
    }
  };

  const isDataStep = step === 3;

  return (
    <View style={styles.onboardingContainer}>
      <View
        style={[
          styles.onboardingContent,
          isDataStep && styles.onboardingContentTop,
        ]}
      >
        {step === 0 && (
          <>
            <Text style={styles.onboardingEmoji}>💚</Text>
            <Text style={styles.onboardingTitle}>Добро пожаловать в FinMind</Text>
            <Text style={styles.onboardingSubtitle}>
              Твой личный финансист который знает куда уходят деньги
            </Text>
          </>
        )}

        {step === 1 && (
          <>
            <Text style={styles.onboardingEmoji}>📱</Text>
            <Text style={styles.onboardingTitle}>Как это работает</Text>
            <View style={styles.onboardingFeatures}>
              <Text style={styles.onboardingFeature}>
                ✅ Банк присылает SMS → мы читаем автоматически
              </Text>
              <Text style={styles.onboardingFeature}>
                ✅ ИИ анализирует каждую трату
              </Text>
              <Text style={styles.onboardingFeature}>
                ✅ Ты получаешь умные инсайты
              </Text>
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.onboardingEmoji}>🔒</Text>
            <Text style={styles.onboardingTitle}>Твои данные в безопасности</Text>
            <Text style={styles.onboardingSubtitle}>
              Все транзакции хранятся только на твоём телефоне. Мы видим только
              анонимные цифры.
            </Text>
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.onboardingTitle}>Загрузи первые данные</Text>
            <Text style={[styles.onboardingSubtitle, styles.dataSubtitle]}>
              Скопируй несколько SMS от Kaspi или Halyk и вставь сюда — мы всё
              разберём автоматически
            </Text>

            <Pressable
              style={[
                styles.onboardingButton,
                styles.kaspiButton,
                isParsingPdf && styles.buttonDisabled,
              ]}
              onPress={handleKaspiUpload}
              disabled={isParsingPdf}
            >
              <Text style={styles.onboardingButtonText}>
                Загрузить выписку из Kaspi
              </Text>
            </Pressable>

            {isParsingPdf && (
              <View style={styles.pdfLoading}>
                <ActivityIndicator color="#4CAF50" size="small" />
                <Text style={styles.pdfLoadingText}>
                  ИИ анализирует выписку...
                </Text>
              </View>
            )}

            <TextInput
              style={styles.smsInput}
              placeholder="Вставь сюда SMS от банка. Например: Покупка 8 400 ₸ Magnum. Остаток: 45 230 ₸"
              placeholderTextColor="#666666"
              value={smsText}
              onChangeText={setSmsText}
              multiline
              textAlignVertical="top"
            />
          </>
        )}
      </View>

      <View style={styles.onboardingFooter}>
        {!isDataStep && (
          <>
            <OnboardingDots step={step} />
            <Pressable style={styles.onboardingButton} onPress={onNext}>
              <Text style={styles.onboardingButtonText}>
                {step === 2 ? 'Начать' : 'Далее'}
              </Text>
            </Pressable>
          </>
        )}

        {isDataStep && !isParsingPdf && (
          <>
            <Pressable style={styles.onboardingButton} onPress={handleAnalyze}>
              <Text style={styles.onboardingButtonText}>Анализировать</Text>
            </Pressable>
            <Pressable onPress={onComplete}>
              <Text style={styles.onboardingSkip}>Пропустить, начну с нуля</Text>
            </Pressable>
          </>
        )}
      </View>

      <StatusBar style="light" />
    </View>
  );
}

function MainApp({
  transactions,
  insight,
  currentBalance,
  onOpenBalanceModal,
  onTransactionsUpdate,
}) {
  const [activeTab, setActiveTab] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (activeTab !== 'operations') {
      setSearchQuery('');
    }
  }, [activeTab]);

  const filteredOperations = transactions.filter((tx) =>
    matchesSearch(tx.name, searchQuery),
  );

  const handleDebtPress = (debt) => {
    const leftToPay = debt.paymentsLeft * debt.monthlyAmount;
    Alert.alert(
      debt.name,
      `Осталось к выплате: ${formatTenge(leftToPay)}`,
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'operations' ? (
          <OperationsScreen
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            transactions={filteredOperations}
          />
        ) : activeTab === 'analytics' ? (
          <AnalyticsScreen transactions={transactions} />
        ) : activeTab === 'settings' ? (
          <SettingsScreen onTransactionsLoaded={onTransactionsUpdate} />
        ) : (
          <HomeScreen
            transactions={transactions}
            insight={insight}
            currentBalance={currentBalance}
            onOpenBalanceModal={onOpenBalanceModal}
            onDebtPress={handleDebtPress}
          />
        )}
      </ScrollView>

      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              style={styles.tabItem}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text style={styles.tabIcon}>{tab.icon}</Text>
              <Text
                style={[styles.tabLabel, isActive && styles.tabLabelActive]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <StatusBar style="light" />
    </View>
  );
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [transactions, setTransactions] = useState(DEFAULT_TRANSACTIONS);
  const [aiInsight, setAiInsight] = useState(() => generateInsight(DEFAULT_TRANSACTIONS));
  const [currentBalance, setCurrentBalance] = useState(null);
  const [balanceModalVisible, setBalanceModalVisible] = useState(false);

  const recalculateInsight = async (txList) => {
    const insight = generateInsight(txList);
    setAiInsight(insight);
    await persistAiInsight(insight);
  };

  useEffect(() => {
    async function loadStoredData() {
      try {
        const [storedTransactions, onboardingDone, storedBalance] =
          await Promise.all([
            AsyncStorage.getItem('transactions'),
            AsyncStorage.getItem('onboarding_done'),
            AsyncStorage.getItem(CURRENT_BALANCE_STORAGE_KEY),
          ]);

        if (storedBalance != null) {
          setCurrentBalance(Number(storedBalance));
        }

        if (onboardingDone === 'true' && storedTransactions) {
          const parsed = JSON.parse(storedTransactions);
          setTransactions(parsed);
          setAiInsight(generateInsight(parsed));
          setOnboardingComplete(true);
        }
      } catch (error) {
        console.error('Failed to load stored data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadStoredData();
  }, []);

  const handleSaveBalance = async (balance) => {
    try {
      await AsyncStorage.setItem(CURRENT_BALANCE_STORAGE_KEY, String(balance));
      setCurrentBalance(balance);
      setBalanceModalVisible(false);
    } catch (error) {
      console.error('Failed to save balance:', error);
      Alert.alert('Ошибка', 'Не удалось сохранить баланс');
    }
  };

  const finishOnboarding = async (loadedTransactions) => {
    try {
      if (loadedTransactions?.length) {
        setTransactions(loadedTransactions);
        await recalculateInsight(loadedTransactions);
        await AsyncStorage.setItem(
          'transactions',
          JSON.stringify(loadedTransactions),
        );
        await AsyncStorage.setItem('onboarding_done', 'true');
        setBalanceModalVisible(true);
      }
      setOnboardingComplete(true);
    } catch (error) {
      console.error('Failed to save data:', error);
      Alert.alert('Ошибка', 'Не удалось сохранить данные');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingEmoji}>💚</Text>
        <StatusBar style="light" />
      </View>
    );
  }

  if (!onboardingComplete) {
    return (
      <Onboarding
        step={onboardingStep}
        onNext={() => setOnboardingStep((prev) => prev + 1)}
        onComplete={() => finishOnboarding()}
        onCompleteWithTransactions={finishOnboarding}
      />
    );
  }

  const handleTransactionsUpdate = async (loadedTransactions) => {
    try {
      setTransactions(loadedTransactions);
      await recalculateInsight(loadedTransactions);
      await AsyncStorage.setItem(
        'transactions',
        JSON.stringify(loadedTransactions),
      );
      setBalanceModalVisible(true);
    } catch (error) {
      console.error('Failed to save transactions:', error);
      Alert.alert('Ошибка', 'Не удалось сохранить данные');
    }
  };

  return (
    <>
      <MainApp
        transactions={transactions}
        insight={aiInsight}
        currentBalance={currentBalance}
        onOpenBalanceModal={() => setBalanceModalVisible(true)}
        onTransactionsUpdate={handleTransactionsUpdate}
      />
      <BalanceModal
        visible={balanceModalVisible}
        onClose={() => setBalanceModalVisible(false)}
        onSave={handleSaveBalance}
      />
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingEmoji: {
    fontSize: 72,
  },
  onboardingContainer: {
    flex: 1,
    backgroundColor: '#000000',
    paddingTop: 80,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  onboardingContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardingContentTop: {
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    width: '100%',
  },
  dataSubtitle: {
    marginBottom: 20,
  },
  kaspiButton: {
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  pdfLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 16,
  },
  pdfLoadingText: {
    color: '#9E9E9E',
    fontSize: 14,
  },
  smsInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    height: 200,
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 22,
    padding: 16,
    width: '100%',
  },
  onboardingEmoji: {
    fontSize: 72,
    marginBottom: 32,
  },
  onboardingTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  onboardingSubtitle: {
    color: '#9E9E9E',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  onboardingFeatures: {
    alignSelf: 'stretch',
    gap: 16,
    marginTop: 8,
  },
  onboardingFeature: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 22,
  },
  onboardingFooter: {
    gap: 24,
  },
  onboardingDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  onboardingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2a2a2a',
  },
  onboardingDotActive: {
    backgroundColor: '#4CAF50',
    width: 20,
  },
  onboardingButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  onboardingButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  onboardingSkip: {
    color: '#9E9E9E',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 80,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
    paddingTop: 10,
    paddingBottom: 28,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  tabLabel: {
    color: '#9E9E9E',
    fontSize: 11,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  balanceCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    overflow: 'hidden',
  },
  balanceLabel: {
    color: '#4CAF50',
    fontSize: 13,
    marginBottom: 8,
  },
  balanceAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceArrow: {
    color: '#4CAF50',
    fontSize: 20,
    fontWeight: '700',
    marginRight: 6,
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '700',
  },
  balanceHint: {
    color: '#9E9E9E',
    fontSize: 13,
  },
  balancePrompt: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '600',
    marginTop: 12,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  modalCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 18,
    marginBottom: 16,
  },
  modalButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  operationsTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 20,
  },
  analyticsScreen: {
    paddingTop:
      Platform.OS === 'android'
        ? (RNStatusBar.currentHeight ?? 24) + 12
        : 12,
  },
  analyticsTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 20,
  },
  searchInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 15,
    marginBottom: 20,
  },
  monthLabel: {
    color: '#9E9E9E',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 12,
  },
  periodToggle: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  periodButton: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: '#4CAF50',
  },
  periodButtonText: {
    color: '#9E9E9E',
    fontSize: 14,
    fontWeight: '600',
  },
  periodButtonTextActive: {
    color: '#FFFFFF',
  },
  chartBlock: {
    marginBottom: 24,
    alignItems: 'center',
  },
  donutChartWrap: {
    marginBottom: 28,
    alignItems: 'center',
  },
  chartEmpty: {
    color: '#9E9E9E',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
  },
  categoryList: {
    width: '100%',
    gap: 14,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  categoryColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  categoryName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  categoryAmount: {
    color: '#9E9E9E',
    fontSize: 14,
  },
  analyticsInsightCard: {
    backgroundColor: '#0a2a1a',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  analyticsInsightText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
  },
  profileBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarEmoji: {
    fontSize: 28,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  profileSub: {
    color: '#4CAF50',
    fontSize: 14,
  },
  settingsSection: {
    marginBottom: 20,
  },
  settingsSectionTitle: {
    color: '#9E9E9E',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  settingsCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  settingsRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  settingsRowLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  settingsRowIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  settingsRowLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    flex: 1,
    marginRight: 12,
  },
  settingsValueGray: {
    color: '#9E9E9E',
    fontSize: 14,
  },
  settingsValueGreen: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '500',
  },
  settingsArrow: {
    color: '#9E9E9E',
    fontSize: 18,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleIcon: {
    fontSize: 26,
    marginRight: 8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: '#666666',
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },
  list: {
    gap: 10,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardPressed: {
    opacity: 0.7,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  txIconEmoji: {
    fontSize: 20,
  },
  cardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  storeName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
    flexShrink: 1,
    marginRight: 8,
    minWidth: 0,
  },
  amountColumn: {
    minWidth: 96,
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  amount: {
    fontSize: 16,
    fontWeight: '600',
  },
  amountCompact: {
    fontSize: 13,
  },
  expense: {
    color: '#FF5252',
  },
  income: {
    color: '#4CAF50',
  },
  insightCard: {
    backgroundColor: '#0a2a1a',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
    marginBottom: 10,
  },
  insightLabel: {
    color: '#4CAF50',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  insightText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  insightButton: {
    color: '#4CAF50',
    fontSize: 13,
    fontWeight: '600',
    alignSelf: 'flex-end',
  },
  debtSectionTitle: {
    marginTop: 24,
  },
  debtList: {
    gap: 10,
  },
  debtCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  debtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  debtName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
    marginRight: 12,
  },
  debtAmount: {
    color: '#FF5252',
    fontSize: 15,
    fontWeight: '600',
  },
  debtRemaining: {
    color: '#9E9E9E',
    fontSize: 13,
    marginBottom: 8,
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#2a2a2a',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    backgroundColor: '#4CAF50',
    borderRadius: 2,
  },
  debtTotal: {
    color: '#9E9E9E',
    fontSize: 14,
    marginTop: 12,
  },
});
