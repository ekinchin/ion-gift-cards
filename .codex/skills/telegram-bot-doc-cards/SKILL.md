---
name: telegram-bot-doc-cards
description: Update Telegram bot user/operator documentation and regenerate square PNG instruction cards from bot source code. Use when asked to review or update Telegram bot docs, document bot commands, describe command visibility/limitations, create user and operator Telegram cards, export PNG cards under docs/telegram-bot-cards, or keep Figma and local card exports in sync.
---

# Telegram Bot Doc Cards

## Overview

Use this skill to turn the current Telegram bot implementation into user-facing documentation and reusable social/help cards. The intended output is a checked-in docs page plus 1080x1080 PNG cards for customer and operator audiences.

## Workflow

1. **Read the bot surface from code first.**
   - Search with `rg` before writing: command registration, menu labels, keyboard visibility, access checks, receipt flow, and copy strings.
   - In this project, the useful files are usually `src/bot/handlers/commands.ts`, `src/bot/handlers/keyboards.ts`, `src/bot/handlers/menu-handlers.ts`, `src/bot/handlers/card-replies.ts`, `src/bot/handlers/access.ts`, `src/bot/receipt-flow.ts`, and `src/copy.ts`.
   - Treat code as source of truth over existing card images.

2. **Update documentation before images.**
   - Prefer one concise Russian docs page such as `docs/telegram-bot-ru.md`.
   - Cover customer commands, operator commands, reply-keyboard visibility rules, QR Mini App fallback, and receipt attachment/skip behavior.
   - Add a short link from the architecture or access-control doc only when it helps discoverability.

3. **Design cards for two audiences.**
   - Customer series: first card is bot overview; remaining cards explain customer commands and dynamic menu visibility.
   - Operator series: first card is bot/operator overview; remaining cards explain operator menu, cash-register commands, receipts, skip reasons, and operator history access.
   - Each card should state: command or action, what it does, how it works, and the most important limitation or visibility condition.

4. **Prefer the established light card style.**
   - 1080x1080 PNG.
   - Customer: pale blue background and blue accent.
   - Operator: warm off-white background and green accent.
   - Structure: numbered badge + audience label, large title, intro, command pill, “Как работает” block with three numbered steps, “Ограничение / важно” warning block, short footer.
   - Avoid dense dark cards, nested panels, tiny text, or long prose that competes with Telegram preview readability.

5. **Use Figma when available, but do not hide connector failures.**
   - Load the required Figma skills before Figma write calls.
   - If creating a new file, load the create-new-file skill, resolve `planKey`, then call `create_new_file`.
   - If the Figma MCP connector fails to start or cannot reach its backend, continue with local PNG export when the user needs repository artifacts, and clearly report that Figma was not updated.

6. **Render local PNGs deterministically.**
   - Use `scripts/render-telegram-bot-cards.mjs` from this skill as a starting point.
   - Copy or run it from the target repo root:

```bash
node /path/to/telegram-bot-doc-cards/scripts/render-telegram-bot-cards.mjs /path/to/repo
```

   - The script writes:
     - `docs/telegram-bot-cards/user/user-card-01.png` through `user-card-10.png`
     - `docs/telegram-bot-cards/operator/operator-card-01.png` through `operator-card-08.png`
   - It requires ImageMagick `convert`.

7. **Verify before completion.**
   - Run `identify docs/telegram-bot-cards/user/*.png docs/telegram-bot-cards/operator/*.png` and confirm every card is `1080x1080`.
   - Open representative generated cards with an image viewer tool when available, especially cards with long command names or warnings.
   - Run the project’s relevant check, typically `npm run typecheck`, when docs were changed in a TypeScript repo.
   - Report exactly what was updated, what passed, and whether Figma was actually updated.

## Content Rules

- Include conditions for command/menu visibility, not just command syntax.
- Mark operator-only actions explicitly.
- Mention QR Mini App fallback when `WEB_APP_URL` is absent.
- Mention receipt requirements after `CREATE`, `DEBIT`, and `CREDIT`.
- Keep card text shorter than the docs page. Cards are summaries, not the full manual.
- Never claim Figma was updated unless the Figma tool call succeeded.

## Bundled Script

`scripts/render-telegram-bot-cards.mjs` contains the light-style renderer used for the `ion-gift-card` bot documentation. For another project, update the card data arrays in the script after reading that project’s bot implementation.
