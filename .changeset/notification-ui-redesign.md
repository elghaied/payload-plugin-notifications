---
"@elghaied/payload-plugin-notifications": minor
---

Redesign the notification UI. The bell dropdown and the notifications list view now share one
row: compact, auto-updating relative timestamps ("now" / "40m" / "2d", full timestamp on hover),
unread rows accented and read rows dimmed, and whole-row click that marks the notification read
and navigates to its target. The notifications collection's list view is fully replaced with a
clean, numbered-paginated feed (no search/filter/columns/select). Notification links are
scheme-validated before navigation (rejects `javascript:`/`data:` — XSS hardening).
