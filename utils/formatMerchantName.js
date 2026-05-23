const MAX_MERCHANT_LENGTH = 20;
const PERSON_LAST_PART_MAX = 3;

const MERCHANT_ALIASES = [
  { test: (value) => /7[\s-]?ELEVEN/i.test(value), label: '7-Eleven' },
  { test: (value) => /ALIPAY/i.test(value), label: 'AliPay' },
  { test: (value) => /MAGNUM/i.test(value), label: 'Magnum' },
  { test: (value) => /COFFEEMANIA/i.test(value), label: 'Coffeemania' },
  { test: (value) => /YANDE[XХ]/i.test(value), label: 'Яндекс' },
  { test: (value) => /BURGER\s*KING/i.test(value), label: 'Burger King' },
  { test: (value) => /\bKFC\b/i.test(value), label: 'KFC' },
  { test: (value) => /GLOVO/i.test(value), label: 'Glovo' },
];

function extractMerchantPart(name) {
  if (!name) {
    return '';
  }

  if (name.includes('*')) {
    return name.split('*').pop().trim();
  }

  return name.trim();
}

function cleanMerchantPart(value) {
  return value
    .replace(/[\d\s\-_#.,;:!?]+$/g, '')
    .replace(/^[\s\-_#.,;:!?]+/g, '')
    .trim();
}

function removeShenzhenPrefix(value) {
  if (!/Shenzhen/i.test(value)) {
    return value;
  }

  return value.replace(/Shenzhen\s*/gi, '').trim();
}

function isAllLowercase(value) {
  return /[a-z]/.test(value) && value === value.toLowerCase();
}

function fixTruncatedEnding(value, source = value) {
  if (!value) {
    return value;
  }

  const parts = value.split(/\s+/).filter(Boolean);
  const partial = parts[parts.length - 1];

  if (!partial || partial.length < 4 || /[aeiouy]$/i.test(partial)) {
    return value;
  }

  const sourceWords = source.split(/\s+/).filter(Boolean);
  const fullWord = sourceWords.find(
    (word) =>
      word.length > partial.length &&
      word.toLowerCase().startsWith(partial.toLowerCase()) &&
      /[aeiouy]$/i.test(word),
  );

  if (!fullWord) {
    return value;
  }

  parts[parts.length - 1] = fullWord;
  return parts.join(' ');
}

function applyMerchantCleanups(value, source = value) {
  return fixTruncatedEnding(removeShenzhenPrefix(value), source);
}

function titleCaseWord(word) {
  if (!word) {
    return '';
  }

  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function titleCaseWords(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(titleCaseWord)
    .join(' ');
}

function capitalizeFallback(value) {
  return titleCaseWord(value);
}

function formatPersonShortLastName(label) {
  if (!/\s/.test(label)) {
    return label;
  }

  const parts = label.split(/\s+/).filter(Boolean);
  const lastPart = parts[parts.length - 1];

  if (lastPart.length > 0 && lastPart.length <= PERSON_LAST_PART_MAX) {
    const nameParts = parts.slice(0, -1).map(titleCaseWord);
    return `${nameParts.join(' ')} ${lastPart.charAt(0).toUpperCase()}.`;
  }

  return label;
}

function fitLabelWithinMax(label) {
  const parts = label.split(/\s+/).filter(Boolean);
  let result = '';

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const candidate = result ? `${parts[index]} ${result}` : parts[index];
    if (candidate.length <= MAX_MERCHANT_LENGTH) {
      result = candidate;
    } else {
      break;
    }
  }

  if (result) {
    return fixTruncatedEnding(result, label);
  }

  let truncated = label.slice(0, MAX_MERCHANT_LENGTH);
  const cutMidWord = label[MAX_MERCHANT_LENGTH] && label[MAX_MERCHANT_LENGTH] !== ' ';

  if (cutMidWord) {
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 0) {
      truncated = truncated.slice(0, lastSpace);
    }
  }

  return fixTruncatedEnding(truncated, label);
}

function truncateMerchant(label) {
  if (label.length <= MAX_MERCHANT_LENGTH) {
    return formatPersonShortLastName(fixTruncatedEnding(label, label));
  }

  const truncated = fitLabelWithinMax(label);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > 0) {
    const firstPart = truncated.slice(0, lastSpace);
    const lastPart = truncated.slice(lastSpace + 1);

    if (lastPart.length > 0 && lastPart.length <= PERSON_LAST_PART_MAX) {
      return `${titleCaseWord(firstPart)} ${lastPart.charAt(0).toUpperCase()}.`;
    }

    return titleCaseWords(truncated);
  }

  return capitalizeFallback(truncated);
}

function matchKnownMerchant(value) {
  return MERCHANT_ALIASES.find((alias) => alias.test(value))?.label;
}

function formatMerchantLabel(cleaned) {
  if (isAllLowercase(cleaned)) {
    return /\s/.test(cleaned) ? titleCaseWords(cleaned) : capitalizeFallback(cleaned);
  }

  return cleaned;
}

export function formatMerchantName(name) {
  const extracted = extractMerchantPart(name);
  const cleaned = applyMerchantCleanups(cleanMerchantPart(extracted), extracted);

  if (!cleaned) {
    return 'Без названия';
  }

  const known = matchKnownMerchant(cleaned);
  if (known) {
    return truncateMerchant(known);
  }

  return truncateMerchant(formatMerchantLabel(cleaned));
}
