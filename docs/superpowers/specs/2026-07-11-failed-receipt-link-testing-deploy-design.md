# Failed Receipt Link and Testing Deployment Design

## Goal

Show a saved receipt URL even when receipt verification fails, grant the production operator access in the non-production environments, and deploy the change to the testing environment for manual verification.

## Receipt history presentation

`formatReceiptSummary` remains the single presentation point for receipt information in card history. For a receipt with status `failed`, history shows the localized failed status and verification reason. If `receiptUrl` exists, it is appended on a separate line. A missing URL produces no empty placeholder.

Presentation for `pending_verification`, `verified`, and `skipped` receipts remains unchanged. The underlying receipt parsing, verification, persistence, and access rules do not change.

## Operator access

Use the same raw Telegram user ID that identifies the active production operator. Add or reactivate that operator in both prestable and testing without removing existing operators. Because operator authorization resolves `telegram_user_id_hmac`, each target environment must store a hash calculated with that environment's own `TELEGRAM_ID_HMAC_SECRET`; reusing the production hash is not assumed safe.

Read the production ID without exposing it in committed files or final output. Apply changes directly to the scoped environment databases using an idempotent create-or-reactivate operation.

Before mutation, map the requested names `prestable` and `testing` to the actual configured deployment environments/resources. Do not infer that local `test` or documented `preprod` resources are interchangeable if the active configuration says otherwise.

## Deployment

Deploy only the testing environment using the repository's existing deployment workflow. The deployed revision must contain the receipt-history change. Do not deploy production or prestable as part of this request.

After deployment, verify the workflow result and the testing API health endpoint. Report the testing bot/environment entry point needed for manual verification, without exposing tokens, Telegram IDs, database credentials, or HMAC values.

## Tests and acceptance criteria

- A regression test first demonstrates that a failed receipt with both a verification reason and URL currently omits the URL.
- After the fix, history contains the localized failure reason and the saved URL.
- Existing receipt-history tests remain green.
- The production operator exists and is active in prestable and testing, while existing operator rows remain intact.
- The testing deployment finishes successfully and its health endpoint responds successfully.

## Scope

No changes to receipt validation rules, receipt storage, card balances, production deployment, or operator permissions beyond the requested environment records.
