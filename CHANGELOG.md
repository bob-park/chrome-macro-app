# Changelog

## [1.0.0.0] - 2026-04-08

### Added
- Element picker with Shadow DOM overlay for selecting click targets on any page
- Auto-clicker with millisecond-precision intervals and configurable repeat count
- Page auto-refresh with sub-minute intervals (setTimeout chain, not chrome.alarms)
- Multi-strategy selector engine with 6-level priority fallback (id > ARIA > CSS > XPath > text > positional)
- Popup UI with Setup and Saved tabs, live running stats display
- Saved macro configurations stored locally in chrome.storage
- Auto-resume clicking after page reload via storage state self-start
- Click count reporting throttled to 1/sec for performance at fast intervals

### Fixed
- chrome.alarms 1-minute minimum period silently clamping short refresh intervals
- Storage write flooding at fast click intervals (10ms = 100 writes/sec)
- Positional selector fallback matching elements in wrong parent containers
