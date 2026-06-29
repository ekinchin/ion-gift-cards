import { userCopy } from '../copy.ts';

export const menuButtonLabels = userCopy.bot.menuButtons;

export type MenuAction = keyof typeof menuButtonLabels;

const menuActionsByLabel = new Map<string, MenuAction>(
  Object.entries(menuButtonLabels).map(([action, label]) => [label, action as MenuAction])
);

export function parseMenuButton(text: string): MenuAction | null {
  return menuActionsByLabel.get(text.trim()) ?? null;
}
