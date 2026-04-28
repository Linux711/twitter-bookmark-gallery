// ============================================================
//  popup.js — Extension UI
//  Communicates with content.js via messages.
//  Does NOT inject its own extraction logic into the page.
// ============================================================

const STORAGE_KEY      = 'twitterBookmarks';
const AUTO_EXTRACT_KEY = 'twitterBookmarksAutoExtract';

let currentView       = 'current';
let lastExtractedData = [];

// ── Storage helpers ──────────────────────────────────────────

async function loadSavedData() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || {};
}

async function saveData(data) {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

// ── Stats ────────────────────────────────────────────────────

async function updateStats() {
  const saved = await loadSavedData();
  const count = Object.keys(saved).length;

  document.getElementById('viewAllBtn').textContent = `All Saved (${count})`;

  if (count > 0) {
    const statsDiv = document.getElementById('stats');
    statsDiv.innerHTML = `
      <strong>📚 Total saved:</strong> ${count} tweets<br>
      <strong>🖼️ Total images:</strong> ${Object.values(saved).reduce((sum, t) => sum + t.images.length, 0)}
    `;
  }
}

// ── Gallery renderer ─────────────────────────────────────────

function renderGallery(tweets, showSavedBadge = false) {
  const gallery = document.getElementById('gallery');
  gallery.innerHTML = '';

  if (tweets.length === 0) {
    gallery.innerHTML = '<div style="text-align: center; color: #8899a6; padding: 40px;">No tweets to display</div>';
    return;
  }

  tweets.forEach(tweet => {
    tweet.images.forEach(imgUrl => {
      const item = document.createElement('div');
      item.className = 'gallery-item';

      item.innerHTML = `
        <div class="gallery-image">
          <img src="${imgUrl}" alt="Tweet image" loading="lazy">
          ${showSavedBadge ? '<div class="saved-badge">SAVED</div>' : ''}
        </div>
        <div class="gallery-info">
          <div class="author">
            <a href="${tweet.authorUrl}" target="_blank">@${tweet.author}</a>
          </div>
          ${tweet.text ? `<div class="tweet-text">${tweet.text}</div>` : ''}
          <div class="links">
            <a href="${tweet.tweetUrl}" target="_blank">Tweet</a>
            <a href="${imgUrl}" target="_blank">Full Image</a>
          </div>
        </div>
      `;

      item.querySelector('.gallery-image img').addEventListener('click', () => {
        window.open(imgUrl, '_blank');
      });

      // Click gallery item to toggle details (but not when clicking the image or links)
      item.addEventListener('click', (e) => {
        // Don't toggle if clicking on the image or links
        if (e.target.closest('.gallery-image') || e.target.closest('a')) {
          return;
        }
        item.classList.toggle('details-visible');
      });

      gallery.appendChild(item);
    });
  });
}

// ── Extract button (manual, one-shot) ────────────────────────

document.getElementById('extractBtn').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  const gallery   = document.getElementById('gallery');

  statusDiv.className   = 'loading';
  statusDiv.textContent = 'Extracting bookmarks...';
  gallery.innerHTML     = '';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url.includes('/bookmarks')) {
      statusDiv.className   = 'error';
      statusDiv.textContent = 'Please navigate to your Twitter/X bookmarks page first!';
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractBookmarks,
    });

    const extractedTweets = results[0].result;

    if (extractedTweets.length === 0) {
      statusDiv.className   = 'error';
      statusDiv.textContent = 'No bookmarks found. Try scrolling to load more.';
      return;
    }

    const savedData = await loadSavedData();
    let newCount = 0;
    let existingCount = 0;

    extractedTweets.forEach(tweet => {
      if (!savedData[tweet.tweetId]) {
        savedData[tweet.tweetId] = { ...tweet, savedAt: new Date().toISOString() };
        newCount++;
      } else {
        existingCount++;
      }
    });

    await saveData(savedData);

    statusDiv.className = 'success';
    statusDiv.innerHTML = `
      Found ${extractedTweets.length} tweets:<br>
      ✅ ${newCount} new | ⏭️ ${existingCount} already saved
    `;

    lastExtractedData = extractedTweets;
    renderGallery(extractedTweets, existingCount > 0);
    await updateStats();

    currentView = 'current';
    document.getElementById('viewCurrentBtn').classList.add('active');
    document.getElementById('viewAllBtn').classList.remove('active');

  } catch (error) {
    statusDiv.className   = 'error';
    statusDiv.textContent = `Error: ${error.message}`;
    console.error(error);
  }
});

// ── Open full gallery ────────────────────────────────────────

document.getElementById('openGalleryBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('gallery.html') });
});

// ── View toggle ──────────────────────────────────────────────

document.getElementById('viewCurrentBtn').addEventListener('click', () => {
  currentView = 'current';
  document.getElementById('viewCurrentBtn').classList.add('active');
  document.getElementById('viewAllBtn').classList.remove('active');
  renderGallery(lastExtractedData);
});

document.getElementById('viewAllBtn').addEventListener('click', async () => {
  currentView = 'all';
  document.getElementById('viewAllBtn').classList.add('active');
  document.getElementById('viewCurrentBtn').classList.remove('active');

  const savedData = await loadSavedData();
  const allTweets = Object.values(savedData);
  renderGallery(allTweets, true);
});

// ── Export ───────────────────────────────────────────────────

document.getElementById('exportBtn').addEventListener('click', async () => {
  const data = await loadSavedData();
  const blob  = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = `twitter-bookmarks-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);

  const statusDiv       = document.getElementById('status');
  statusDiv.className   = 'success';
  statusDiv.textContent = 'Exported successfully!';
});

// ── Import ───────────────────────────────────────────────────

document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const statusDiv       = document.getElementById('status');
  statusDiv.className   = 'loading';
  statusDiv.textContent = 'Importing data...';

  const reader  = new FileReader();
  reader.onload = async (event) => {
    try {
      const importedData = JSON.parse(event.target.result);

      if (typeof importedData !== 'object') throw new Error('Invalid data format');

      const existingData = await loadSavedData();
      let newCount     = 0;
      let updatedCount = 0;

      Object.keys(importedData).forEach(tweetId => {
        if (existingData[tweetId]) updatedCount++;
        else newCount++;
        existingData[tweetId] = importedData[tweetId];
      });

      await saveData(existingData);
      await updateStats();

      statusDiv.className = 'success';
      statusDiv.innerHTML = `Import successful!<br>✅ ${newCount} new tweets | 🔄 ${updatedCount} updated`;

      e.target.value = '';

    } catch (error) {
      statusDiv.className   = 'error';
      statusDiv.textContent = `Import failed: ${error.message}`;
    }
  };

  reader.onerror = () => {
    statusDiv.className   = 'error';
    statusDiv.textContent = 'Failed to read file';
  };

  reader.readAsText(file);
});

// ── Auto-extract Start / Stop ────────────────────────────────
//  The popup only sends messages. content.js owns the scroll loop.

const maxBookmarksInput = document.getElementById('maxBookmarksInput');
const startBtn          = document.getElementById('startBtn');
const stopBtn           = document.getElementById('stopBtn');

// Restore saved limit across popup opens
const savedLimit = localStorage.getItem('maxBookmarks');
if (savedLimit) maxBookmarksInput.value = savedLimit;

function setRunningState(isRunning) {
  startBtn.disabled          = isRunning;
  stopBtn.disabled           = !isRunning;
  maxBookmarksInput.disabled = isRunning;
}

startBtn.addEventListener('click', async () => {
  const limit     = parseInt(maxBookmarksInput.value, 10) || 20;
  const [tab]     = await chrome.tabs.query({ active: true, currentWindow: true });
  const statusDiv = document.getElementById('status');

  localStorage.setItem('maxBookmarks', String(limit));

  if (!tab.url.includes('/bookmarks')) {
    statusDiv.className   = 'error';
    statusDiv.textContent = 'Please navigate to your Twitter/X bookmarks page to use auto-extract.';
    return;
  }

  chrome.tabs.sendMessage(
    tab.id,
    { type: 'START_AUTO_EXTRACT', maxBookmarks: limit },
    () => {
      statusDiv.className   = 'success';
      statusDiv.textContent = `✅ Auto-extract started! Collecting up to ${limit} bookmarks.`;
      setRunningState(true);
    }
  );
});

stopBtn.addEventListener('click', async () => {
  const [tab]     = await chrome.tabs.query({ active: true, currentWindow: true });
  const statusDiv = document.getElementById('status');

  chrome.tabs.sendMessage(tab.id, { type: 'STOP_AUTO_EXTRACT' }, () => {
    statusDiv.className   = 'success';
    statusDiv.textContent = '⏹ Auto-extract stopped.';
    setRunningState(false);
  });
});

// On popup open, sync button states with what content.js is actually doing
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.includes('/bookmarks')) {
    chrome.tabs.sendMessage(tab.id, { type: 'CHECK_AUTO_EXTRACT' }, (response) => {
      if (response) setRunningState(response.running);
    });
  }
})();

// content.js sends this when the scroll loop completes naturally
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'AUTO_EXTRACT_FINISHED') {
    setRunningState(false);
    const statusDiv       = document.getElementById('status');
    statusDiv.className   = 'success';
    statusDiv.textContent = `✅ Auto-extract complete! Collected ${message.total} bookmarks.`;
    updateStats();
  }
});

// ── Initialize ───────────────────────────────────────────────

updateStats();

// ── extractBookmarks (injected for manual one-shot extract) ──
//  This is ONLY used by the manual Extract button above.
//  Auto-extract uses content.js exclusively.

function extractBookmarks() {
  const tweets  = [];
  const seenIds = new Set();

  document.querySelectorAll('article[data-testid="tweet"]').forEach(article => {
    try {
      const tweetLink = article.querySelector('a[href*="/status/"]');
      if (!tweetLink) return;

      const tweetUrl = tweetLink.href;
      const tweetId  = tweetUrl.match(/status\/(\d+)/)?.[1];
      if (!tweetId || seenIds.has(tweetId)) return;
      seenIds.add(tweetId);

      let author    = 'unknown';
      let authorUrl = '';

      const userNameDiv = article.querySelector('[data-testid="User-Name"]');
      if (userNameDiv) {
        const links = userNameDiv.querySelectorAll('a[href^="/"]');
        if (links.length >= 2) {
          const match = links[1].href.match(/(?:twitter\.com|x\.com)\/([^/?]+)/);
          if (match?.[1]) { author = match[1]; authorUrl = `https://twitter.com/${author}`; }
        }
        if (author === 'unknown') {
          const usernameText = userNameDiv.textContent.match(/@(\w+)/);
          if (usernameText?.[1]) { author = usernameText[1]; authorUrl = `https://twitter.com/${author}`; }
        }
      }

      if (author === 'unknown') {
        const profileLinks = article.querySelectorAll(
          'a[href^="/"]:not([href*="/status/"]):not([href*="/photo/"]):not([href*="/hashtag/"])'
        );
        for (const link of profileLinks) {
          const match = link.href.match(/(?:twitter\.com|x\.com)\/([^/?]+)$/);
          if (match?.[1] && match[1] !== 'i' && match[1] !== 'home') {
            author = match[1]; authorUrl = `https://twitter.com/${author}`; break;
          }
        }
      }

      const text   = article.querySelector('[data-testid="tweetText"]')?.textContent || '';
      const images = [];

      article.querySelectorAll('img[src*="media"]').forEach(img => {
        let src = img.src;
        if (src.includes('pbs.twimg.com/media')) {
          src = src.split('?')[0] + '?format=jpg&name=large';
          if (!images.includes(src)) images.push(src);
        }
      });

      if (images.length > 0) {
        tweets.push({ tweetId, tweetUrl, author, authorUrl, text: text.substring(0, 200), images });
      }

    } catch (err) {
      console.error('Error parsing tweet:', err);
    }
  });

  return tweets;
}