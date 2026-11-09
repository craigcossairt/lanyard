# Time handling
- Store and transmit times as UTC ISO-8601 strings.
- Render times only through the shared event-timezone helper (event timezone `America/Denver`). Flag `toLocaleString` without an explicit timezone, manual offset math, and parsing of local time strings.
