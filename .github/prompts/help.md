Post a comment on the issue or PR with the following content (and nothing else):

---

## AI Assistant Commands

The following commands are available in issue and PR comments:

| Command | Description | Custom Text |
|---|---|---|
| `/ai [text]` | General-purpose — context-dependent. On a PR: full re-review. On an issue: analyze and respond. With text: address the specific request. | Optional |
| `/review [text]` | Explicit code review of the current PR. Append text to focus the review. | Optional |
| `/fix <description>` | Fix a specific bug or issue. Creates a branch, writes regression tests (TDD), opens a PR, iterates through automated review until approved, then merges. | Required |
| `/implement <description>` | Implement a feature. Follows TDD. Creates a branch, opens a PR, iterates through review. | Required |
| `/test <target>` | Write or improve tests for specified code. TDD. Creates a branch, opens a PR. | Required |
| `/analyze [text]` | Deep read-only analysis. Posts findings as a comment. No code changes. | Optional |
| `/explain <topic>` | Explain code, architecture, or data flow. Posts explanation as a comment. | Required |
| `/security [text]` | Security-focused review. Checks secrets, input validation, auth, rate limiting. | Optional |
| `/triage [text]` | Triage an issue — categorize, prioritize, assess impact, suggest labels. | Optional |
| `/help` | Show this command reference. | — |

**All commands are available to repository owners, members, and collaborators.**

**Code change commands** (`/fix`, `/implement`, `/test`) **follow the review-iterate-approve workflow:**
1. Create feature branch
2. Open PR
3. Automated review triggers
4. Fix findings and push (re-review triggers)
5. Repeat until approved
6. Merge with squash
