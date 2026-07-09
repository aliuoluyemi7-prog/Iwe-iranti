# Changelog

## v1.0.0 — Stable release

First tagged release after moving from a single-file prototype to a
modular, tested architecture.

### Storage & reliability
- Migrated from localStorage to IndexedDB as the primary entry store,
  with automatic one-time migration of existing entries and automatic
  fallback to localStorage on browsers without IndexedDB.
- Per-entry writes: saving/editing/deleting one entry no longer
  rewrites the whole diary.
- Storage failures surface as a toast instead of failing silently.

### Security
- Encrypted backup/restore, passphrase-protected (AES-GCM + PBKDF2,
  120,000 iterations), independent of the device PIN — doubles as a
  recovery path if the PIN is forgotten.
- Fixed: a stale autosave timer could fire after navigating away or
  deleting an entry and silently create a duplicate/misattributed
  entry. Autosave is now cancelled on save, delete, and entry switch.
- Fixed: users who previously chose "skip PIN" were re-prompted to
  set up a PIN again after updating. A persistent `configured` flag
  now distinguishes "never configured" from "chose to skip."

### Search
- Multi-word search (all terms must match, in any order) across
  title, content, mood, tags, and date.
- Matched terms are highlighted inline.
- Date-range filter, combinable with mood/tag/favorite filters.
- Result count and a "Clear all" control.

### Architecture
- Split the single ~1050-line `app.js` into 13 focused files
  (state, crypto, ui, storage, lock, editor, search, calendar, trash,
  backup, reminders, idb, app-bootstrap) loaded as classic scripts so
  all existing inline `onclick` handlers keep working unchanged.

### Testing
- Playwright-based browser tests covering: PIN setup/unlock, IndexedDB
  persistence, encrypted backup round-trip (including wrong-passphrase
  rejection), trash/restore, localStorage fallback, legacy-data
  migration, and search (multi-word matching, highlighting, date
  range, filter combinations, clear-all).

---

## Next planned (post-1.0.0, quality-first)
- Auto-lock after inactivity + clear key from memory on lock
- Virtual scrolling / lazy rendering / debounced search for large diaries
- Startup integrity check, interrupted-write recovery, versioned migrations
- Accessibility: keyboard nav, screen-reader labels, high-contrast, font size
- Expanded test coverage (large datasets, cross-browser) before any new features
