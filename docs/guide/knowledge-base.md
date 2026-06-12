# Knowledge Base

The knowledge base lets agents answer questions from your documents. You build a **knowledge library** — files uploaded from your computer or imported from Google Drive, Dropbox, or OneDrive — and assign files to agents. Each file is converted to text, split into chunks, embedded, and stored in the agent's [memory](/guide/memory), where the agent retrieves the relevant pieces by meaning during conversations.

Two design decisions worth knowing up front:

- **File content is never pasted into the agent's prompt.** The agent only receives the list of file names; it searches for relevant chunks on demand with `memory_search`. This keeps prompts small and works for documents far larger than any context window.
- **Original file bytes are never stored.** Only the extracted text is kept (along with where in the file it came from), which is enough to re-process the file at any time.

## Requirements

Knowledge ingestion needs an **embedding model** on the agent — the same requirement as [memory](/guide/memory#requirements). Files can be added to the library without one, but assigning them to an agent that has no embedding model leaves the assignment in an error state until you configure a model and reprocess.

## The knowledge library

**Knowledge** (in the sidebar) is your account-wide file library. Files belong to your account, not to a single agent — upload once, assign to as many agents as you like. The page shows every file with its source, extraction status, size, and a delete button.

### Uploading files

Click **Upload files** and pick up to 10 files (max 20 MB each). Supported formats:

| Format                | Extensions                       |
| --------------------- | -------------------------------- |
| PDF                   | `.pdf`                           |
| Word                  | `.docx`                          |
| Excel                 | `.xlsx`                          |
| PowerPoint            | `.pptx`                          |
| Plain text / Markdown | `.txt`, `.md`, `.markdown`       |
| Data / web            | `.csv`, `.json`, `.html`, `.htm` |

The declared file type is never trusted on its own — the platform re-verifies formats against the actual file bytes.

### Importing from cloud storage

Click **Import from cloud**, pick a provider and one of your compatible [credentials](/guide/credentials), then browse folders, search, and multi-select files (up to 20 per import). Files are downloaded server-side and processed exactly like uploads.

| Provider                  | Compatible credential                                                        | Notes                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Google Drive**          | [Google Drive](/integrations/google) (or Google Workspace with Drive scopes) | Native Google Docs / Sheets / Slides are automatically exported to `.docx` / `.xlsx` / `.pptx` first. |
| **Dropbox**               | [Dropbox access token](/integrations/dropbox)                                | Dropbox tokens are short-lived by default — a 401 during browsing means the token needs regenerating. |
| **OneDrive / SharePoint** | [Microsoft OneDrive](/integrations/microsoft-onedrive)                       | Covers personal OneDrive files and SharePoint document libraries (via Microsoft Graph).               |

Files with unsupported extensions appear grayed out in the browser and cannot be selected. The provider list is pluggable — more services can be added over time.

## How files are processed

Processing happens in two phases, both in the background — you can keep working while statuses update live.

### Phase 1 — Text extraction (once per file)

When a file enters the library, its text is extracted into **located segments**: pieces of text that each remember where they came from in the original file.

| Format     | Segment granularity                                         | Location the agent can cite     |
| ---------- | ----------------------------------------------------------- | ------------------------------- |
| PDF        | One per page                                                | "Page 3"                        |
| Word       | Paragraph groups                                            | "Paragraphs 12–21"              |
| Excel      | 50-row blocks per sheet (header row repeated in each block) | "Sheet 'Q1 Budget' rows 51–100" |
| PowerPoint | One per slide                                               | "Slide 7"                       |
| Text / CSV | Line blocks (CSV header repeated in each block)             | "Lines 81–160"                  |
| HTML       | Tags stripped, then line blocks                             | "Lines 81–160"                  |

These segments (capped at 5 MB of text per file) are what gets stored — the original file is discarded after extraction. Password-protected, corrupt, or empty files end in an **error** status with an explanation.

### Phase 2 — Chunking and embedding (once per agent assignment)

When a file is assigned to an agent, its segments are:

1. **Split into chunks** of roughly 400 words. Splits prefer paragraph breaks, then sentence boundaries, with a hard cap of 600 words; a chunk never spans two pages, slides, or sheets, so every chunk keeps one unambiguous source location.
2. **Embedded** using that agent's embedding model, in batches.
3. **Stored as memory entries** flagged as knowledge-base content, each carrying the file name, its location label, and its position in the file.

This phase runs **per agent** because different agents can use different embedding models — the same file assigned to three agents is embedded three times, independently. Assigning a file that is already assigned is a no-op, and re-processing never creates duplicate entries.

### Statuses

Both library files (extraction) and agent assignments (ingestion) move through the same lifecycle:

| Status         | Meaning                                                              |
| -------------- | -------------------------------------------------------------------- |
| **Pending**    | Queued — or, for an assignment, waiting for the file's extraction    |
| **Processing** | Extraction or embedding is running                                   |
| **Ready**      | Done; assignment rows also show how many chunks were created         |
| **Error**      | Failed — hover the badge for the reason; fix the cause and reprocess |

If the server restarts mid-processing, affected items are marked **error** with a note to retry — nothing gets stuck spinning forever.

## Assigning knowledge to agents

On the [agent form](/guide/agents#knowledge-base), the **Knowledge Base** card lists the agent's assigned files. Click **Add knowledge** to pick files from your library — you can also upload or cloud-import right from that dialog, and new files are selected automatically. Changes apply when you **save the agent** (this works during agent creation too).

Removing a file from an agent deletes that agent's chunks for it immediately; the file itself stays in the library and other agents keep their copies. Deleting a file from the **library** removes it from every agent at once — the confirmation tells you how many agents are affected.

## How agents use knowledge

An agent with ready knowledge files gets a short note in its system prompt listing the file names and instructing it to retrieve content with `memory_search` and to **cite sources** as `file name, location` — e.g. _"Q3 Report.pdf, Page 4"_. Retrieval is semantic: asking about "travel reimbursement" can surface a chunk about "expense policy for trips" even with no shared keywords.

Knowledge chunks live in the same vector store as regular [memory](/guide/memory), but they are **hidden from the agent's memory page** — manage them through the knowledge pages instead. They are searchable by the agent like any other memory.

## Reprocessing

Each assignment has a **reprocess** action that re-chunks and re-embeds from the stored text — no re-upload needed. Use it after:

- **Changing the agent's embedding model.** Embeddings from the old model are unusable by the new one; reprocess every assigned file after switching.
- A transient failure (provider outage, rate limit) left the assignment in **error**.
- Assigning files before the agent had an embedding model.

## Limits

| Limit                        | Value               |
| ---------------------------- | ------------------- |
| File size                    | 20 MB               |
| Files per upload             | 10                  |
| Files per cloud import       | 20                  |
| Stored extracted text / file | 5 MB                |
| Chunk size                   | ~400 words (target) |

## Troubleshooting

| Symptom                                              | Cause and fix                                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Assignment error: _"Agent has no embedding model…"_  | Set an embedding model on the agent ([LLM Providers](/guide/llm-providers)), then reprocess.                                         |
| File error: _"password-protected"_                   | Remove the PDF's password and re-upload.                                                                                             |
| File error: _"Unsupported file format"_              | The content didn't match a supported format (renaming a file's extension doesn't help — bytes are verified).                         |
| File error: _"No extractable text found"_            | The document has no text layer — e.g. a scanned/image-only PDF. OCR is not supported yet.                                            |
| Cloud browse fails with 401 / `expired_access_token` | The credential's token expired. Dropbox tokens are short-lived — regenerate the token; OAuth2 credentials may need **Re-authorize**. |
| Google Drive export error                            | Very large native Google files exceed Google's export size limit (~10 MB). Download and upload the file manually instead.            |
| Agent doesn't use the documents                      | Check the assignment is **Ready** with a non-zero chunk count, and ask a question whose answer is actually in the file.              |
