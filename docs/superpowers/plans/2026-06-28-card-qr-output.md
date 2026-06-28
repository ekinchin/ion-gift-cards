# Card QR Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send a Telegram QR image containing the plain text card code whenever the bot creates or shows a card.

**Architecture:** Add a small bot helper that renders a PNG QR from `card.code` using the existing `qrcode` dependency and sends it through grammY `replyWithPhoto` with a copyable text caption. Command and menu handlers keep the existing business flow and replace only the final card display response.

**Tech Stack:** Node.js 24, TypeScript, grammY, `qrcode`, `node:test`.

---

### Task 1: QR Helper

**Files:**
- Create: `src/bot/card-qr.ts`
- Create: `src/types/qrcode.d.ts`
- Test: `test/bot.card-qr.test.ts`

- [x] **Step 1: Write failing tests**

Add tests that import `createCardQrPng` and `formatCardQrCaption`, assert the PNG signature, decode the QR through the `qrcode` internal PNG metadata shape indirectly by checking output size, and assert the caption contains the plain card code.

- [x] **Step 2: Run focused tests**

Run: `npm test -- test/bot.card-qr.test.ts`

Expected before implementation: module import fails because `src/bot/card-qr.ts` does not exist.

- [x] **Step 3: Implement helper**

Implement `createCardQrPng(code)` via `QRCode.toBuffer(code, { type: 'png', errorCorrectionLevel: 'M', margin: 2, scale: 8 })`, `formatCardQrCaption(title, card)`, and `replyWithCardQr(ctx, title, card)`.

- [x] **Step 4: Run focused tests**

Run: `npm test -- test/bot.card-qr.test.ts`

Expected after implementation: tests pass.

### Task 2: Bot Responses

**Files:**
- Modify: `src/bot/handlers/card-replies.ts`
- Modify: `src/bot/handlers/commands/create.ts`
- Modify: `src/bot/handlers/menu-handlers.ts`

- [x] **Step 1: Replace card display responses**

Use `replyWithCardQr` for `/my_card`, `/create_my_card`, owned balance without explicit code, `/create_gift_card`, and menu-driven gift-card creation. Keep error and non-card responses as text.

- [x] **Step 2: Preserve manual code fallback**

Ensure every QR photo caption includes the exact `card.code` so users can still copy or type it.

### Task 3: Documentation and Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`

- [x] **Step 1: Update docs**

Document that generated QR images encode the plain text public code, while the Mini App scanner reads that same code.

- [x] **Step 2: Verify**

Run:

```bash
npm test -- test/bot.card-qr.test.ts
npm run typecheck
npm test
```

Expected: all commands exit 0.
