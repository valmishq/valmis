---
name: code-reviewer
description: Review code for bugs, security vulnerabilities, style issues, and best practices. Use when the user asks you to review, audit, or critique a code snippet, pull request, or file.
metadata:
  author: valmis
  version: '1.0'
  evolvable: true
---

## Code Review

Use this skill when reviewing code for quality, correctness, and security.

### When to activate

- The user pastes code and asks for a review, audit, or feedback
- The user asks you to check for bugs, security issues, or style violations
- The user wants a pull request reviewed

### Procedure

1. Read the entire code block before commenting — avoid piecemeal feedback
2. Check in this order:
   - **Correctness:** Logic errors, off-by-one errors, unhandled edge cases
   - **Security:** Injection vulnerabilities, hardcoded secrets, unsafe deserialization, missing auth checks
   - **Performance:** Obvious N+1 queries, unnecessary re-computation, blocking I/O in hot paths
   - **Readability:** Naming clarity, function length, dead code
3. Group findings by severity: `critical`, `warning`, `suggestion`
4. Provide a concise fix or explanation for each finding
5. End with a brief overall summary

### Output format

```
## Code Review

### Critical
- [issue] [file:line if available] — [explanation + suggested fix]

### Warnings
- [issue] — [explanation]

### Suggestions
- [improvement] — [rationale]

### Summary
[1-3 sentence overall assessment]
```

### Gotchas

- Do not rewrite the entire file unless asked — only point out issues
- Do not comment on style if the user has an existing formatter config
- Security issues always outrank style issues in severity
