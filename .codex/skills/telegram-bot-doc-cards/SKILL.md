---
name: telegram-bot-doc-cards
description: Use when asked to review or update Telegram bot docs, document bot command visibility or limitations, create editable Telegram instruction cards, export bot manual PNGs from Figma, or sync ION bot card artifacts.
---

# Telegram Bot Doc Cards

## Overview

Use this skill to turn the current Telegram bot implementation into user-facing documentation and reusable Telegram help cards. The intended output is a checked-in docs page plus editable Figma cards in the ION workfile, exported from Figma to PNG for customer and operator audiences.

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
   - Design each card as a Telegram-friendly square, normally `1080x1080`.
   - Customer: pale blue background and blue accent.
   - Operator: warm off-white background and green accent.
   - Structure: numbered badge + audience label, large title, intro, command pill, “Как работает” block with three numbered steps, “Ограничение / важно” warning block, short footer.
   - Avoid dense dark cards, nested panels, tiny text, or long prose that competes with Telegram preview readability.
   - Keep all visible card copy in Russian except command names, product names, and common abbreviations such as QR.
   - Hide implementation details. Do not mention internal terms such as actor, policy, transaction, owned card, bearer, provider, `operatorId`, environment variables, or database table names on cards.

5. **Create and maintain cards in Figma first.**
   - Use the existing Figma file [ИОN workfile](https://www.figma.com/design/WJOSvRZu0A6MMYKnKql9Qp/%D0%98%D0%9EN-workfile?node-id=1059-324&t=WIUcKiFQ56mlH6jU-0), file key `WJOSvRZu0A6MMYKnKql9Qp`.
   - Place the cards inside the frame named `ionobotmanual`, starting from node `1059:324` when that node is available. The `ionobotmanual` frame may be resized to fit the full manual.
   - Build every card as editable Figma layers: text must remain real text layers, command pills and blocks must be separate shapes/text, and cards must be easy to edit without rerunning a renderer.
   - Size cards for Telegram preview readability. Use `1080x1080` unless the user explicitly requests another Telegram-appropriate format.
   - Keep a clear naming scheme in Figma, for example `user-card-01`, `user-card-02`, `operator-card-01`, and so on.
   - Do not create a new Figma file for this workflow unless the user explicitly asks for one.
   - Load the required Figma skills before Figma write calls.
   - If the Figma connector cannot update the file, do not claim success and do not silently replace the workflow with local-only rendering. Report the connector failure clearly and ask before using a local fallback.

6. **Export PNGs from Figma.**
   - Export the Figma card nodes to PNG after the editable Figma cards are created or updated.
   - Save exported PNGs under:
     - `docs/telegram-bot-cards/user/user-card-01.png` through the last customer card
     - `docs/telegram-bot-cards/operator/operator-card-01.png` through the last operator card
   - Treat local rendering as a legacy fallback only. Use `scripts/render-telegram-bot-cards.mjs` only when the user explicitly accepts local fallback or when updating historical artifacts that are not backed by Figma.
   - If local fallback is approved, copy or run it from the target repo root:

```bash
node /path/to/telegram-bot-doc-cards/scripts/render-telegram-bot-cards.mjs /path/to/repo
```

   - The script writes legacy local exports:
     - `docs/telegram-bot-cards/user/user-card-01.png` through `user-card-10.png`
     - `docs/telegram-bot-cards/operator/operator-card-01.png` through `operator-card-08.png`
   - It requires ImageMagick `convert`.

7. **Verify before completion.**
   - Run `identify docs/telegram-bot-cards/user/*.png docs/telegram-bot-cards/operator/*.png` and confirm every card is `1080x1080`.
   - Confirm the exported PNGs came from Figma unless local fallback was explicitly approved.
   - Inspect the Figma file or exported node metadata enough to confirm card text remains editable in Figma.
   - If using the legacy local renderer, keep its layout guard enabled. If it throws a text overflow error, shorten the card text instead of shrinking it into unreadable type.
   - Open representative generated cards with an image viewer tool when available, especially cards with long command names or warnings.
   - Run the project’s relevant check, typically `npm run typecheck`, when docs were changed in a TypeScript repo.
   - Report exactly what was updated, what passed, which Figma nodes were updated/exported, and whether any fallback was used.

## Content Rules

- Include conditions for command/menu visibility, not just command syntax.
- Mark operator-only actions explicitly.
- Mention QR-scanner fallback without exposing config variable names.
- Mention receipt requirements after gift-card creation, debit, and credit without exposing internal transaction type names.
- Keep card text shorter than the docs page. Cards are summaries, not the full manual.
- Use audience language: explain what a user or operator needs to know, not how the code or database implements it.
- Never claim Figma was updated unless the Figma tool call succeeded.
- Never flatten card text into PNG-only assets before Figma export. Text must stay editable in Figma.

## Bundled Script

`scripts/render-telegram-bot-cards.mjs` contains the legacy light-style local renderer used before the Figma-first workflow. Prefer editable Figma cards in `ionobotmanual` and PNG export from Figma. Use the script only for explicitly approved fallback work or for comparing historical output.
