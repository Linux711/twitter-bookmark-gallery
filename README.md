# Twitter/X Bookmarks Gallery

A Chrome extension that extracts images from your Twitter/X bookmarks into gallery.

## Features

### Core Functionality
- **Extract Images** from your Twitter/X bookmarks page
- **Automatically Detects** and saves only new bookmarks (no duplicates)
- **Captures Relevant Details**, including tweet author, text, links, and timestamps
- **Image Links Only** – all saved locally in your browser

### Backup & Restore

- **Export:** Click "Export Data" to download a JSON backup file
- **Import:** Click "Import Data" and select your JSON file to restore

### Storage
- Uses browser's localStorage (not the images themselves, just URLs and metadata)
- Typical storage: ~500-800 bytes per bookmark
- 1000 bookmarks = ~500KB-1MB storage
- Browser limit: 5-10MB (enough for thousands of bookmarks)
