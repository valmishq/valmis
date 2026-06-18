---
name: web-search
description: Search the web for current information, news, facts, and URLs. Use when the user asks for up-to-date information, real-time data, recent events, or anything that requires browsing the internet.
metadata:
  author: valmis
  version: '1.0'
  evolvable: false
---

## Web Search

Use this skill when you need to retrieve current information from the internet.

### When to activate

- The user asks about recent news, events, or time-sensitive data
- The question requires information beyond your training cutoff
- The user explicitly asks you to "search the web" or "look this up online"

### Procedure

1. Formulate a concise, targeted search query from the user's request
2. Execute the search using the available web search tool
3. Scan the returned results for the most relevant and authoritative sources
4. Extract the key information needed to answer the user's question
5. Cite sources with URLs in your response

### Gotchas

- Prefer official sources (`.gov`, `.edu`, news outlets) over aggregators for factual claims
- If search results are ambiguous or contradictory, report the discrepancy rather than picking one answer
- Do not fabricate URLs — only reference URLs returned by the search tool
