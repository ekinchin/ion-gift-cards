export const menuButtonLabels = {
  balance: '💳 Баланс',
  history: '📋 История',
  mycards: '🎟️ Моя карта',
  createPersonal: '➕ Создать мою карту',
  link: '🔗 Привязать карту',
  unlink: '⛓️ Отвязать карту',
  debit: '🔴 Списать',
  credit: '🟢 Пополнить',
  create: '➕ Создать подарочную карту',
} as const;

export type MenuAction = keyof typeof menuButtonLabels;

const menuActionsByLabel = new Map<string, MenuAction>(
  Object.entries(menuButtonLabels).map(([action, label]) => [label, action as MenuAction])
);

export function parseMenuButton(text: string): MenuAction | null {
  return menuActionsByLabel.get(text.trim()) ?? null;
}
