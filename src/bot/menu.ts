export const menuButtonLabels = {
  balance: '💳 Баланс',
  history: '📋 История',
  mycards: '🎟️ Мои карты',
  link: '🔗 Привязать карту',
  scan: '📷 Сканировать QR',
  debit: '🔴 Списать',
  credit: '🟢 Пополнить',
  create: '➕ Создать карту',
} as const;

export type MenuAction = keyof typeof menuButtonLabels;

const menuActionsByLabel = new Map<string, MenuAction>(
  Object.entries(menuButtonLabels).map(([action, label]) => [label, action as MenuAction])
);

export function parseMenuButton(text: string): MenuAction | null {
  return menuActionsByLabel.get(text.trim()) ?? null;
}
