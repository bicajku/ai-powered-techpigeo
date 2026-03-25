# RAG Chat Core - Phase 4 Plan

Goal: Add conversational, auditable RAG threads while keeping current modules stable.

## Scope

1. Conversation persistence
   - `chat_threads`
   - `chat_messages`
   - per-thread metadata and ownership

2. Retrieval traceability
   - `retrieval_traces`
   - stores chunk ids, similarity, provider/model, latency, and decision notes

3. Query pipeline integration
   - add `threadId` and `messageId` support in `sentinelQuery` path
   - save user + assistant turns with source trace link

4. UX baseline
   - thread list + active thread view
   - citations panel for each assistant response

## Incremental tickets

- P4-T1: SQL migration for chat and trace tables (additive only)
- P4-T2: `sentinel-brain` data access helpers for thread/message CRUD
- P4-T3: pipeline wiring for conversational context window + trace saves
- P4-T4: initial chat UI shell with thread switching
- P4-T5: citations and provider trace panel

## Safety

- Additive schema only; no destructive migrations.
- Feature-flagged entry point, default off.
