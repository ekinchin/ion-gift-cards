# Architecture

The project is a modular monolith.

HTTP API and Telegram bot are adapters. They parse external input, authenticate operators, and call application use cases.

Application use cases own business operations and database transaction boundaries.

Repositories own Knex queries and never decide business rules.

Database constraints protect critical invariants for balances, transaction amounts, and foreign keys.

