---
"@elghaied/payload-plugin-notifications": patch
---

Fix relative timestamps showing "0m" for notifications between 45 and 59 seconds old — they now clamp to "1m" (anything under the 45s "now" cutoff still reads "now").
