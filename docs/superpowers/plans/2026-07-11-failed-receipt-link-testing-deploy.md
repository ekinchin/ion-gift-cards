# Failed Receipt Link and Testing Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display failed receipt links, grant the production operator access in prestable and testing, and deploy the verified change to testing.

**Architecture:** Keep receipt persistence and verification unchanged and adjust only the history formatter. Discover the real environment mapping from GitHub/Yandex configuration before touching operator rows, then perform idempotent environment-scoped updates using each environment's own identity secret. Deploy the committed revision through the existing release workflow and verify its API health.

**Tech Stack:** TypeScript, Node.js test runner, PostgreSQL/Knex, GitHub Actions CLI, Yandex Cloud CLI.

## Global Constraints

- Preserve the unrelated existing change in `docs/terms-of-use-ru.md`.
- Never print or commit Telegram IDs, bot tokens, database credentials, Lockbox payloads, or Telegram identity HMAC secrets/hashes.
- Keep existing prestable/testing operators; create or reactivate only the production operator identity.
- Do not deploy production or prestable.
- Interpret environment names only after inspecting configured GitHub environments and Yandex resources.

---

### Task 1: Failed Receipt History Presentation

**Files:**
- Modify: `test/bot.receipt-history.test.ts`
- Modify: `src/bot/handlers/card-replies.ts:13-29`

**Interfaces:**
- Consumes: `TransactionWithReceipt.receipt.status`, `receiptUrl`, and `verificationError`.
- Produces: `formatReceiptSummary(tx)` output containing a localized failure reason and optional URL.

- [ ] **Step 1: Strengthen the existing test with the missing URL expectation**

Add this assertion after the failed-receipt reason assertion:

```ts
assert.match(ctx.replies[0]!.text, /https:\/\/example\.test\/failed/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --experimental-strip-types --test test/bot.receipt-history.test.ts`

Expected: FAIL because the reply does not contain `https://example.test/failed`.

- [ ] **Step 3: Implement the minimal formatter change**

Build the failed-receipt line from the label and localized reason, then append `receiptUrl` on a new indented line when present. Leave the existing non-failed path unchanged:

```ts
if (failureReason) {
  const failureSummary = `\n   ${userCopy.bot.receipts.icon} ${label}: ${failureReason}`;
  return tx.receipt.receiptUrl
    ? `${failureSummary}\n   ${tx.receipt.receiptUrl}`
    : failureSummary;
}
```

- [ ] **Step 4: Run focused and full checks**

Run:

```bash
node --experimental-strip-types --test test/bot.receipt-history.test.ts
npm test
npm run typecheck
```

Expected: all commands exit 0 with no test failures or TypeScript errors.

- [ ] **Step 5: Commit the behavior change**

```bash
git add src/bot/handlers/card-replies.ts test/bot.receipt-history.test.ts
git commit -m "Show links for failed receipt checks"
```

### Task 2: Map Environments and Synchronize the Operator

**Files:**
- No repository files changed.

**Interfaces:**
- Consumes: active production operator row; configured production, prestable, and testing database/Lockbox resources.
- Produces: active target operator rows with target-secret-derived `telegram_user_id_hmac` values.

- [ ] **Step 1: Inspect environment configuration without secret payloads**

List GitHub environments/variables, recent workflow runs, and named Yandex resources. Confirm how `prestable` and `testing` map to the repository's documented `preprod` and local `test` names. Stop and ask for direction if either requested environment has no unambiguous configured resource.

- [ ] **Step 2: Read the production operator identity privately**

Connect using production Lockbox-backed database configuration and select the active operator's raw `telegram_id` and display name into shell-local masked values. Do not echo them.

- [ ] **Step 3: Upsert the operator in prestable**

Using the prestable database configuration and its own `TELEGRAM_ID_HMAC_SECRET`, calculate `hashTelegramUserId(productionTelegramId, prestableSecret)`. In one transaction, update the matching raw ID to `is_active=true`, its current HMAC, and the production display name; insert it if missing. Verify with boolean/count output only: exactly one active match.

- [ ] **Step 4: Upsert the operator in testing**

Repeat Step 3 against the mapped testing database and testing secret. Verify with boolean/count output only: exactly one active match.

- [ ] **Step 5: Confirm preservation of existing operators**

Compare aggregate active/total counts captured before and after each target update. Expected: no rows removed, and only the selected identity created or reactivated.

### Task 3: Publish and Deploy Testing

**Files:**
- No additional repository files changed.

**Interfaces:**
- Consumes: committed tested revision and mapped testing deployment target.
- Produces: a healthy testing API/bot running that revision.

- [ ] **Step 1: Confirm deployable Git state**

Run `git status --short`, `git log -3 --oneline`, and `git diff --check`. Ensure the unrelated terms document remains uncommitted and the receipt fix is committed.

- [ ] **Step 2: Push the revision required by the deployment workflow**

Push the current branch/ref without force. If the current workflow only deploys tags or only accepts `preprod`/`production`, use the mapped existing testing mechanism; do not broaden the workflow or select production implicitly.

- [ ] **Step 3: Start and monitor the testing deployment**

Dispatch the existing workflow for the mapped testing target and watch the resulting run to completion. Expected: build, migrations, API deployment, bot deployment, and smoke steps all succeed.

- [ ] **Step 4: Verify deployed health and revision**

Call the mapped testing API `/health` endpoint and inspect the deployed API container/VM revision metadata. Expected: successful health response and image/ref corresponding to the committed receipt fix.

- [ ] **Step 5: Report the manual test entry point**

Provide the testing bot username or environment URL, the expected failed-receipt rendering, deployment run URL, and verification evidence. Do not include secret values or the operator Telegram ID.

### Task 4: Final Requirement Verification

**Files:**
- Inspect: `docs/superpowers/specs/2026-07-11-failed-receipt-link-testing-deploy-design.md`

**Interfaces:**
- Consumes: test output, target database count checks, workflow result, health response.
- Produces: evidence-backed completion report.

- [ ] **Step 1: Re-run local verification**

Run:

```bash
npm test
npm run typecheck
git diff --check
```

Expected: tests and typecheck exit 0; diff check reports no whitespace errors.

- [ ] **Step 2: Check every acceptance criterion**

Confirm from fresh evidence: failed receipt includes reason and URL; both target operator records are active; testing deploy succeeded; testing health succeeds; production/prestable were not deployed.

- [ ] **Step 3: Inspect final repository state**

Run `git status --short` and `git log -3 --oneline`. Report the user's preserved unrelated change separately from task commits.
