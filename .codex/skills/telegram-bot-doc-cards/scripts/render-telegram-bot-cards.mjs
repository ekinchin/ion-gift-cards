import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const projectRoot = resolve(process.argv[2] ?? process.cwd());
const root = join(projectRoot, 'docs', 'telegram-bot-cards');
const size = 1080;

try {
  execFileSync('convert', ['-version'], { stdio: 'ignore' });
} catch {
  console.error('ImageMagick `convert` is required to render PNG cards.');
  process.exit(1);
}

if (!existsSync(join(projectRoot, 'docs'))) {
  console.error(`Expected a docs directory under project root: ${projectRoot}`);
  process.exit(1);
}

const palette = {
  user: {
    bg: '#edf8fc',
    badge: '#c7ecfb',
    accent: '#1e88e5',
    card: '#ffffff',
    warning: '#fff0d9',
    warningBorder: '#ff9800',
  },
  operator: {
    bg: '#fbfaf3',
    badge: '#d5f1e8',
    accent: '#00796b',
    card: '#ffffff',
    warning: '#fff0d9',
    warningBorder: '#ff9800',
  },
  text: '#101418',
  muted: '#56616b',
  border: '#d2dae0',
};

const userCards = [
  {
    title: 'Зачем нужен бот Ион',
    command: '/start',
    intro: 'Бот помогает пользоваться картой в Telegram: код, QR, баланс и история.',
    steps: ['Показывает меню действий.', 'Помогает создать, привязать или передать карту.', 'Даёт QR для предъявления на кассе.'],
    warning: 'Списание, пополнение и выпуск подарочных карт доступны только оператору.',
    footer: 'Начните с /start или кнопки меню.',
  },
  {
    title: 'Баланс карты',
    command: '/balance [код]',
    intro: 'Показывает баланс текущей или указанной карты.',
    steps: ['Без кода использует вашу привязанную карту.', 'С кодом показывает публичный баланс карты.', 'Если карты нет, бот предложит QR-сканер или ручной ввод.'],
    warning: 'Кто знает код карты, может посмотреть её баланс.',
    footer: 'Кнопка "Баланс" видна в меню всегда.',
  },
  {
    title: 'Моя карта',
    command: '/my_card',
    intro: 'Возвращает QR, код и баланс текущей карты пользователя.',
    steps: ['Бот определяет пользователя Telegram.', 'Ищет привязанную карту.', 'Отправляет QR для предъявления на кассе.'],
    warning: 'Если карты нет, бот предложит создать новую или привязать существующую.',
    footer: 'Кнопка "Моя карта" видна в меню всегда.',
  },
  {
    title: 'Создать мою карту',
    command: '/create_my_card',
    intro: 'Создаёт личную карту для текущего пользователя Telegram.',
    steps: ['Бот просит согласие на личную карту.', 'Если карты ещё нет, создаёт её.', 'Показывает QR, код и баланс карты.'],
    warning: 'Без согласия личную карту создать или привязать нельзя.',
    footer: 'Кнопка видна, когда у клиента нет привязанной карты.',
  },
  {
    title: 'Привязать карту',
    command: '/link [код]',
    intro: 'Привязывает существующую карту к пользователю Telegram.',
    steps: ['Бот просит согласие на привязку.', 'С кодом привязывает карту сразу.', 'Без кода предлагает QR или ручной ввод.'],
    warning: 'Нельзя привязать карту, которая уже принадлежит другому пользователю.',
    footer: 'Кнопка видна, когда у клиента нет привязанной карты.',
  },
  {
    title: 'Отвязать карту',
    command: '/unlink [код]',
    intro: 'Отвязывает карту от пользователя Telegram.',
    steps: ['Бот показывает предупреждение.', 'После подтверждения отвязывает карту.', 'Показывает QR, код и баланс.'],
    warning: 'История операций этой карты в боте будет удалена.',
    footer: 'Кнопка видна, когда у клиента есть привязанная карта.',
  },
  {
    title: 'Передать карту',
    command: '/transfer [код]',
    intro: 'Создаёт одноразовый код передачи карты другому человеку.',
    steps: ['Без кода используется текущая карта.', 'Бот просит подтвердить передачу.', 'Команду нужно переслать получателю.'],
    warning: 'Передать можно только карту, владельцем которой вы являетесь.',
    footer: 'Команда видна в глобальном меню Telegram.',
  },
  {
    title: 'Принять карту',
    command: '/accept_transfer <код>',
    intro: 'Привязывает карту по коду передачи.',
    steps: ['Бот просит согласие и подтверждение.', 'Проверяет срок действия кода.', 'Карта становится картой получателя.'],
    warning: 'История прежнего владельца удаляется, баланс карты сохраняется.',
    footer: 'Команда видна в глобальном меню Telegram.',
  },
  {
    title: 'История операций',
    command: '/history [код]',
    intro: 'Показывает последние операции по карте и статусы чеков.',
    steps: ['Без кода открывает историю вашей карты.', 'С кодом проверяет доступ к истории.', 'Показывает до 10 последних операций.'],
    warning: 'История привязанной карты доступна владельцу или оператору.',
    footer: 'Кнопка "История" видна в меню всегда.',
  },
  {
    title: 'Когда меняется меню',
    command: 'reply-клавиатура',
    intro: 'Кнопки в нижнем меню зависят от состояния карты пользователя.',
    steps: ['Баланс, История и Моя карта видны всегда.', 'Создать и Привязать видны, когда карты нет.', 'Отвязать видна, когда карта уже есть.'],
    warning: 'Если состояние карты определить не удалось, бот показывает запасной набор действий.',
    footer: 'Команды остаются доступными независимо от кнопок.',
  },
];

const operatorCards = [
  {
    title: 'Роль оператора',
    command: '/start',
    intro: 'Оператор работает с картами клиентов на кассе и имеет отдельные команды.',
    steps: ['Бот узнаёт, что вы оператор.', 'Показывает операторское меню.', 'Добавляет кассовые команды в чат.'],
    warning: 'Если прав оператора нет, кассовые действия будут отклонены.',
    footer: 'Права оператора выдаются администратором.',
  },
  {
    title: 'Операторское меню',
    command: 'reply-клавиатура',
    intro: 'Оператор видит клиентские действия и кассовые кнопки.',
    steps: ['Баланс, История и Моя карта остаются доступны.', 'Видны Создать, Привязать и Отвязать.', 'Добавляются кассовые действия.'],
    warning: 'Каждая кассовая кнопка повторно проверяет права оператора.',
    footer: 'Меню появляется после /start у активного оператора.',
  },
  {
    title: 'Списать с карты',
    command: '/debit <код> <сумма>',
    intro: 'Списывает сумму с карты клиента.',
    steps: ['С кодом карты списывает сразу.', 'Без кода предлагает QR или ручной ввод.', 'После операции бот просит чек.'],
    warning: 'Сумма должна быть больше нуля, а баланс карты должен быть достаточным.',
    footer: 'Команда и кнопка видны только активным операторам.',
  },
  {
    title: 'Пополнить карту',
    command: '/credit <код> <сумма>',
    intro: 'Увеличивает баланс карты клиента.',
    steps: ['С кодом карты пополняет сразу.', 'Без кода предлагает QR или ручной ввод.', 'После операции бот просит чек.'],
    warning: 'Сумма должна быть больше нуля. Описание необязательно.',
    footer: 'Команда и кнопка видны только активным операторам.',
  },
  {
    title: 'Подарочная карта',
    command: '/create_gift_card',
    intro: 'Создаёт новую карту с начальным балансом для выдачи клиенту.',
    steps: ['Оператор вводит начальную сумму.', 'Бот создаёт карту и отправляет QR/код.', 'После создания бот просит чек.'],
    warning: 'Формат: /create_gift_card <начальная_сумма>. Сумма должна быть больше нуля.',
    footer: 'Кнопка видна только на операторской клавиатуре.',
  },
  {
    title: 'Чек после операции',
    command: 'QR чека',
    intro: 'После создания, списания и пополнения бот ждёт чек.',
    steps: ['Оператор сканирует QR чека.', 'Бот сохраняет чек и показывает статус.', 'Статус чека попадает в историю.'],
    warning: 'Если сканер недоступен, отправьте причину пропуска текстом.',
    footer: 'Чек относится к конкретной операции.',
  },
  {
    title: 'Пропустить чек',
    command: 'причина текстом',
    intro: 'Если чек нельзя приложить, оператор указывает причину.',
    steps: ['Допустимы: нечитаемый QR, чек потерян.', 'Также: касса без QR, техническая ошибка.', 'Для "другое" нужен комментарий.'],
    warning: 'Дубликат чека не прикрепляется к другой операции.',
    footer: 'Пропуск доступен сразу после кассовой операции.',
  },
  {
    title: 'История для оператора',
    command: '/history [код]',
    intro: 'Оператор может смотреть историю карты по её коду.',
    steps: ['Оператор вводит код карты.', 'Бот показывает до 10 операций.', 'В истории видны статусы чеков.'],
    warning: 'Обычный пользователь не видит историю чужой привязанной карты.',
    footer: 'Чужая история закрыта для обычных пользователей.',
  },
];

const forbiddenVisibleTerms = [
  'bearer',
  'owned',
  'account',
  'WEB_APP_URL',
  'CREATE',
  'DEBIT',
  'CREDIT',
  'record',
  'pending receipt',
  'transaction',
  'Policy',
  'actor',
  'operatorId',
  'operators',
  'provider',
  'database',
  'таблиц',
  'базе operators',
  'Telegram ID',
];

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function wrapText(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textLines(lines, x, y, options = {}) {
  const {
    size: fontSize = 30,
    fill = palette.text,
    weight = 400,
    maxChars = 48,
    lineHeight = Math.round(fontSize * 1.34),
  } = options;
  let svg = '';
  let cursor = y;
  for (const raw of lines) {
    for (const line of wrapText(raw, maxChars)) {
      svg += `<text x="${x}" y="${cursor}" font-size="${fontSize}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`;
      cursor += lineHeight;
    }
  }
  return { svg, y: cursor };
}

function assertCardCopy(card, audience, index) {
  const values = [
    card.title,
    card.command,
    card.intro,
    ...card.steps,
    card.warning,
    card.footer,
  ];
  const fullText = values.join('\n');
  const badTerm = forbiddenVisibleTerms.find((term) => fullText.includes(term));
  if (badTerm) {
    throw new Error(`${audience} card ${index}: visible copy contains internal term "${badTerm}"`);
  }
}

function cardSvg(card, index, total, audience) {
  assertCardCopy(card, audience, index);
  const p = palette[audience];
  const role = audience === 'user' ? 'ПОЛЬЗОВАТЕЛЬ' : 'ОПЕРАТОР';
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${p.bg}"/>
  <rect x="72" y="70" width="92" height="54" rx="18" fill="${p.badge}"/>
  <text x="118" y="105" text-anchor="middle" font-size="25" font-weight="800" fill="${p.accent}">${String(index).padStart(2, '0')}</text>
  <text x="188" y="104" font-size="20" font-weight="800" fill="${p.accent}" letter-spacing="1">${role}</text>`;

  const title = textLines([card.title], 72, 216, {
    size: 54,
    weight: 800,
    maxChars: 23,
    lineHeight: 64,
  });
  if (title.y > 330) {
    throw new Error(`${audience} card ${index}: title overflows into intro area`);
  }
  svg += title.svg;

  const intro = textLines([card.intro], 72, 354, {
    size: 28,
    fill: palette.muted,
    maxChars: 54,
    lineHeight: 38,
  });
  if (intro.y > 430) {
    throw new Error(`${audience} card ${index}: intro overflows into command area`);
  }
  svg += intro.svg;

  svg += `<rect x="72" y="440" width="936" height="78" rx="18" fill="${p.card}" stroke="${palette.border}" stroke-width="2"/>
  <text x="108" y="491" font-size="30" font-weight="800" fill="${p.accent}">${escapeXml(card.command)}</text>`;

  svg += `<rect x="72" y="548" width="936" height="268" rx="24" fill="${p.card}" stroke="${palette.border}" stroke-width="2"/>
  <text x="102" y="584" font-size="24" font-weight="800" fill="${p.accent}">Как работает</text>`;

  let stepY = 638;
  let lastStepTextBottom = stepY;
  card.steps.forEach((step, stepIndex) => {
    svg += `<circle cx="120" cy="${stepY - 8}" r="18" fill="${p.badge}"/>
    <text x="120" y="${stepY + 1}" text-anchor="middle" font-size="18" font-weight="800" fill="${p.accent}">${stepIndex + 1}</text>`;
    const lines = textLines([step], 156, stepY, {
      size: 26,
      fill: palette.text,
      maxChars: 50,
      lineHeight: 32,
    });
    svg += lines.svg;
    lastStepTextBottom = lines.y;
    stepY = lines.y + 18;
  });
  if (lastStepTextBottom > 810) {
    throw new Error(`${audience} card ${index}: steps overflow into warning area`);
  }

  svg += `<rect x="72" y="824" width="936" height="142" rx="22" fill="${p.warning}" stroke="${p.warningBorder}" stroke-width="2"/>
  <text x="102" y="854" font-size="18" font-weight="900" fill="${p.accent}">ОГРАНИЧЕНИЕ / ВАЖНО</text>`;
  const warning = textLines([card.warning], 102, 894, {
    size: 25,
    fill: palette.text,
    maxChars: 58,
    lineHeight: 32,
  });
  if (warning.y > 958) {
    throw new Error(`${audience} card ${index}: warning text overflows its block`);
  }
  svg += warning.svg;

  svg += `<text x="72" y="1038" font-size="22" font-weight="600" fill="${p.accent}">${escapeXml(card.footer)}</text>
  </svg>`;
  return svg;
}

function renderSet(cards, audience) {
  const dir = join(root, audience);
  mkdirSync(dir, { recursive: true });
  cards.forEach((card, index) => {
    const number = String(index + 1).padStart(2, '0');
    const svgPath = `/tmp/${audience}-card-${number}.svg`;
    const pngPath = join(dir, `${audience}-card-${number}.png`);
    writeFileSync(svgPath, cardSvg(card, index + 1, cards.length, audience));
    execFileSync('convert', [svgPath, pngPath], { stdio: 'inherit' });
  });
}

renderSet(userCards, 'user');
renderSet(operatorCards, 'operator');
