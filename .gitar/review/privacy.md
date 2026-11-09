# Privacy conventions
- Question text, caption text, attendee interests and preferences must never appear in logs, span attributes, span events, metric attributes, or error messages.
- Attendees are anonymous. Flag any field that stores email, real name, phone, or device identifiers for attendees.
- Secrets come only from environment variables. Flag any literal key, token, or connection string.
