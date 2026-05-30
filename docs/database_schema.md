# FinCore Database Schema

This document outlines the database schema for the FinCore project, which uses Drizzle ORM and PostgreSQL. The schema reflects the definitions found in the `0000_aromatic_mathemanic.sql` migration and the `0001_event_publishing.sql` migration.

## Entity-Relationship Diagram (ERD)

The following Mermaid diagram provides a visual representation of the tables and their relationships:

```mermaid
erDiagram
    users ||--o{ payment_methods : has
    users ||--o{ transaction_categories : has
    users ||--o{ transaction_tags : has
    users ||--o{ transactions : has
    users ||--o{ raw_messages : "sends/receives"
    users ||--o{ recurring_bills : has
    users ||--o{ reports : has

    raw_messages ||--o{ ai_processing_logs : has
    raw_messages ||--o| raw_ai_outputs : has
    raw_messages ||--o{ transactions : "creates (optional)"

    transactions ||--o{ transaction_tag_mappings : "has tags"
    transaction_tags ||--o{ transaction_tag_mappings : "belongs to"
    transaction_categories ||--o{ transactions : categorizes
    payment_methods ||--o{ transactions : "paid with"
    payment_methods ||--o{ transactions : "transferred to (optional)"
    payment_methods ||--o{ recurring_bills : "paid with (optional)"
    transaction_categories ||--o{ recurring_bills : "categorizes (optional)"

    webhook_subscriptions ||--o{ webhook_delivery_logs : "has delivery logs"

    users {
        uuid id PK
        text phone UK
        text name
        text timezone
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }

    raw_messages {
        uuid id PK
        uuid user_id FK
        text wa_message_id UK
        text from
        message_type type
        text body
        text media_url
        text media_mimetype
        integer media_size
        text storage_path
        jsonb raw_payload
        processing_status processing_status
        text processing_error
        timestamp received_at
        timestamp processed_at
        timestamp created_at
    }

    raw_ai_outputs {
        uuid id PK
        uuid raw_message_id FK
        text prompt
        text response
        jsonb parsed_output
        text provider
        text model
        integer input_tokens
        integer output_tokens
        integer latency_ms
        boolean is_valid
        timestamp created_at
    }

    ai_processing_logs {
        uuid id PK
        uuid raw_message_id FK
        processing_step step
        processing_status status
        text provider
        integer duration_ms
        jsonb input_snapshot
        jsonb output_snapshot
        text error
        timestamp created_at
    }

    transaction_categories {
        uuid id PK
        uuid user_id FK
        text name
        text slug
        transaction_type type
        text icon
        text color
        boolean is_default
        boolean is_active
        integer sort_order
        timestamp created_at
    }

    payment_methods {
        uuid id PK
        uuid user_id FK
        text name
        payment_method_type type
        text icon
        text color
        boolean is_active
        timestamp created_at
    }

    transaction_tags {
        uuid id PK
        uuid user_id FK
        text name
        text color
        timestamp created_at
    }

    transactions {
        uuid id PK
        text name
        uuid user_id FK
        uuid raw_message_id FK "nullable"
        uuid category_id FK "nullable"
        uuid payment_method_id FK "nullable"
        uuid to_payment_method_id FK "nullable"
        transaction_type type
        numeric amount
        numeric fee
        numeric total_amount
        text fee_note
        text currency
        text merchant
        text location
        text notes
        message_type source_type
        real confidence_score
        boolean is_confirmed
        boolean is_deleted
        timestamp transaction_date
        timestamp created_at
        timestamp updated_at
        uuid event_id UK "public stable ID for consumers"
        boolean is_published "default false"
        timestamp published_at "nullable"
    }

    transaction_tag_mappings {
        uuid id PK
        uuid transaction_id FK
        uuid tag_id FK
        timestamp created_at
    }

    recurring_bills {
        uuid id PK
        uuid user_id FK
        text name
        numeric amount
        text currency
        uuid payment_method_id FK "nullable"
        uuid category_id FK "nullable"
        text frequency
        integer day_of_month "nullable"
        integer day_of_week "nullable"
        integer reminder_day_offset
        timestamp next_reminder_at
        timestamp last_reminder_at
        boolean is_active
        text notes
        timestamp created_at
        timestamp updated_at
    }

    reports {
        uuid id PK
        uuid user_id FK
        report_type type
        timestamp period_start
        timestamp period_end
        text summary
        jsonb data
        timestamp sent_at
        timestamp created_at
    }

    webhook_subscriptions {
        uuid id PK
        text name UK "e.g. FINANCE_CORE"
        text url "target endpoint"
        text hashed_secret "for HMAC signing"
        text[] event_types "default {*}"
        boolean is_active
        integer timeout_ms "default 10000"
        integer max_retries "default 3"
        timestamp last_triggered_at "nullable"
        integer last_response_status "nullable"
        timestamp created_at
        timestamp updated_at
    }

    webhook_delivery_logs {
        uuid id PK
        uuid event_id "= transactions.event_id"
        uuid subscription_id FK
        integer attempt
        integer status_code "nullable"
        integer duration_ms "nullable"
        boolean success
        text error "nullable"
        timestamp delivered_at
    }
```

## Enum Definitions

- **`message_type`**: `text`, `voice`, `image`, `document`, `video`
- **`payment_method_type`**: `cash`, `e_wallet`, `bank_transfer`, `credit_card`, `debit_card`, `qris`, `other`
- **`processing_status`**: `pending`, `processing`, `done`, `failed`, `skipped`
- **`processing_step`**: `transcription`, `ocr`, `ai_extraction`, `categorization`, `notification`
- **`report_type`**: `daily`, `weekly`, `monthly`, `custom`
- **`transaction_type`**: `expense`, `income`, `transfer`

## Key Table Details

### Users

Central entity tracking the users of the FinCore application (identified uniquely by their `phone` number).

### Core Financials

- **`transactions`**: The core table for logging any monetary movement (income, expense, transfer). Supports soft deletions and confirmation flags for AI-generated entries.
  - `event_id` — public-facing stable UUID for external consumers (Finance Core, etc.). Different from internal `id` PK. Consumers store this for idempotency.
  - `is_published` / `published_at` — tracks whether the event has been delivered to at least one webhook subscriber.
- **`transaction_categories` & `transaction_tags`**: Allow grouping, tagging, and categorizing transactions. Many-to-many relationship for tags is handled by `transaction_tag_mappings`.
- **`payment_methods`**: Source (and target, for transfers) for financial transactions.
- **`recurring_bills`**: Tracks scheduled financial commitments. Includes detailed timing logic (frequency, day of month, week).

### Messaging & AI Pipeline

- **`raw_messages`**: Initial log of incoming (e.g., from WhatsApp) payloads. Holds attachments, text, or voice paths. Tracks the overarching processing state.
- **`raw_ai_outputs`**: Directly connected to the AI providers processing the message. Logs prompt, response, tokens, and latency to measure accuracy and cost.
- **`ai_processing_logs`**: Step-by-step audit trail for each stage (`transcription`, `ocr`, `ai_extraction`, etc.) applied to a raw message, storing intermediate snapshots of inputs/outputs.

### Event Publishing (Multi-Webhook)

- **`webhook_subscriptions`**: Source of truth for all webhook subscribers. DB-managed; env vars (`FINCORE_WEBHOOK_<NAME>=url|secret|filter`) only bootstrap on startup with no-overwrite semantics.
  - `name` — unique human-readable key, used as upsert key during env bootstrap.
  - `event_types` — PostgreSQL array, `{'*'}` means subscribe to all events.
  - `last_triggered_at` / `last_response_status` — health tracking fields.
- **`webhook_delivery_logs`**: Per-subscriber per-event delivery audit log. `event_id` references `transactions.event_id` (not a FK — allows logs to persist even if transaction is soft-deleted). Useful for debugging, health monitoring, and manual re-delivery.

## Event Publishing Flow

```
Transaction saved (is_published = false)
      ↓
Enqueue: event-publishing job (QueueName.EVENT_PUBLISHING)
      ↓
EventPublisher.publish(FinancialEvent)
      ↓
WebhookRegistryService.getActiveSubscribers(eventType)
      ↓
  ┌── No active subscribers?
  │     → log debug, skip, is_published stays FALSE
  │       (catch-up job will retry when subscribers are registered)
  │
  └── N active subscribers?
        → deliver to ALL in parallel (Promise.allSettled)
        ├── Finance Core  → ✅ 200 OK → log to webhook_delivery_logs
        ├── Google Sheets → ✅ 200 OK → log to webhook_delivery_logs
        └── Custom Script → ❌ timeout → log failure, retry (BullMQ backoff)
        │
        → If ANY succeeds: mark is_published = true, publishedAt = now()
        → Log all results to webhook_delivery_logs
```
