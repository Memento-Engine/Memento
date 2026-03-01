# Memento AI

Memento AI is a personal AI-powered search engine designed to help you browse and retrieve your own memories. It runs locally on your machine, stores all data on your hard drive, and only sends minimal, relevant context to a cloud LLM when required.

---

## Overview

Memento AI transforms your personal data into an intelligent, searchable memory system.

Instead of manually navigating through files, notes, documents, logs, or past conversations, you can ask natural language questions such as:

- "When did I design the booking system schema?"
- "Show me notes related to multi-threading."
- "What were my ideas about subscription architecture?"

Memento AI retrieves the most relevant information from your local data and generates a contextual response.

---

## Core Principles

### 1. Local-First Architecture

Memento AI is built with a strong privacy-first and local-first philosophy.

**Stored locally:**
- Raw data (files, notes, documents, logs)
- Indexed content
- Embeddings (if generated locally)
- Vector store / search database
- Memory metadata

All core data remains on your local hard drive.

### 2. Minimal Cloud Exposure

When cloud LLM integration is enabled:

- Only your query
- Only the top relevant retrieved memory chunks

are sent to the cloud model.

Your full database, full files, or complete memory store are never transmitted.

---

## Architecture

### Step 1: Local Data Ingestion

- Indexes files and structured/unstructured content.
- Extracts text and metadata.
- Stores processed data locally.

### Step 2: Local Search & Retrieval

- Hybrid search (semantic + keyword).
- Retrieves the most relevant chunks based on your query.
- Performs ranking locally before any external call.

### Step 3: Context Filtering

- Selects only high-confidence relevant snippets.
- Prepares a minimal context window.

### Step 4: Optional LLM Augmentation

- Sends filtered context + query to cloud LLM.
- Generates structured or conversational output.
- Returns result to the local application.

---

## Privacy Model

Memento AI does not:

- Upload your entire dataset.
- Sync your memory to external servers.
- Store your data in remote databases.

Cloud LLM usage is:
- Explicit
- Minimal
- Context-restricted

You remain in control of your data at all times.

---

## Use Cases

- Personal knowledge management
- Research recall
- Project history search
- Development notes tracking
- Architecture decision lookup
- Memory augmentation for long-term projects

---

## Key Features

- Local semantic search
- Query-based memory retrieval
- Minimal cloud interaction
- Fast indexing
- Context-aware answers
- Fully offline retrieval mode (without LLM)

---

## Design Goals

- Privacy by default
- Local performance
- Minimal cloud dependency
- Transparent data flow
- Extensible architecture

---

## Philosophy

Your memories are yours.

Memento AI acts as an intelligent layer on top of your local data — not a cloud storage service.

It helps you remember, retrieve, and reason over your own information without giving up control.

---

## Status

This project is under active development. Contributions and feedback are welcome.

---

## License

Specify your license here.
