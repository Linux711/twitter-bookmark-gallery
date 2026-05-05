// ============================================================
//  Content script — X (Twitter) Bookmarks Auto-Extractor
//  Runs on: x.com/i/bookmarks
// ============================================================

const AUTO_EXTRACT_KEY = 'twitterBookmarksAutoExtract';

// ── Tunable constants ────────────────────────────────────────
const MAX_BOOKMARKS  = 20;    // stop after collecting this many bookmarked tweets
const SCROLL_STEP    = 600;   // px to scroll each step
const MIN_DELAY      = 1000;  // ms — minimum pause between scrolls
const MAX_DELAY      = 3000;  // ms — maximum pause between scrolls
const STALL_LIMIT    = 5;     // consecutive scrolls with no new content before giving up
const CONTENT_TIMEOUT = 5000; // ms — max wait for new DOM content after a scroll
// ────────────────────────────────────────────────────────────

let autoExtractRunning = false;
let scrollLoopActive   = false;
let collectedIds       = new Set();   // persists across scroll steps
let stallCount         = 0;

// ── Utilities ────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand  = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;

/** Resolves once the article count in the DOM increases, or after timeout. */
function waitForNewContent(previousCount, timeout = CONTENT_TIMEOUT) {
  return new Promise(resolve => {
    const deadline = Date.now() + timeout;

    const check = () => {
      const current = document.querySelectorAll('article[data-testid="tweet"]').length;
      if (current > previousCount || Date.now() >= deadline) {
        resolve(current);
      } else {
        requestAnimationFrame(check);
      }
    };

    check();
  });
}

// ── Extraction ───────────────────────────────────────────────

function extractBookmarksHelper() {
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

      // ── Author ─────────────────────────────────────────────
      let author    = 'unknown';
      let authorUrl = '';

      const userNameDiv = article.querySelector('[data-testid="User-Name"]');
      if (userNameDiv) {
        const links = userNameDiv.querySelectorAll('a[href^="/"]');
        if (links.length >= 2) {
          const match = links[1].href.match(/(?:twitter\.com|x\.com)\/([^/?]+)/);
          if (match?.[1]) {
            author    = match[1];
            authorUrl = `https://twitter.com/${author}`;
          }
        }

        if (author === 'unknown') {
          const usernameText = userNameDiv.textContent.match(/@(\w+)/);
          if (usernameText?.[1]) {
            author    = usernameText[1];
            authorUrl = `https://twitter.com/${author}`;
          }
        }
      }

      if (author === 'unknown') {
        const profileLinks = article.querySelectorAll(
          'a[href^="/"]:not([href*="/status/"]):not([href*="/photo/"]):not([href*="/hashtag/"])'
        );
        for (const link of profileLinks) {
          const match = link.href.match(/(?:twitter\.com|x\.com)\/([^/?]+)$/);
          if (match?.[1] && match[1] !== 'i' && match[1] !== 'home') {
            author    = match[1];
            authorUrl = `https://twitter.com/${author}`;
            break;
          }
        }
      }

      // ── Text ───────────────────────────────────────────────
      const text = article.querySelector('[data-testid="tweetText"]')?.textContent || '';

      // ── Images ─────────────────────────────────────────────
      const images = [];
      article.querySelectorAll('img[src*="media"]').forEach(img => {
        let src = img.src;
        if (src.includes('pbs.twimg.com/media')) {
          src = src.split('?')[0] + '?format=jpg&name=large';
          if (!images.includes(src)) images.push(src);
        }
      });

      if (images.length > 0) {
        tweets.push({
          tweetId,
          tweetUrl,
          author,
          authorUrl,
          text: text.substring(0, 200),
          images,
        });
      }

    } catch (err) {
      console.error('Error parsing tweet:', err);
    }
  });

  return tweets;
}

/** Extract newly-seen tweets, send to background, return how many were added. */
function extractAndSend() {
  const tweets   = extractBookmarksHelper();
  const newTweets = tweets.filter(t => !collectedIds.has(t.tweetId));

  if (newTweets.length === 0) return 0;

  newTweets.forEach(t => collectedIds.add(t.tweetId));

  chrome.runtime.sendMessage({ type: 'AUTO_EXTRACT', tweets: newTweets }, response => {
    if (response?.newCount > 0) {
      console.log(`[Bookmarks] Sent ${response.newCount} new bookmark(s) to background`);
    }
  });

  return newTweets.length;
}

// ── Auto-scroll loop ─────────────────────────────────────────

async function autoScrollLoop(limit = MAX_BOOKMARKS) {
  console.log(
    `%c[Bookmarks] Auto-scroll started — target: ${limit} bookmarks`,
    'font-weight:bold; color:#1d9bf0'
  );

  stallCount = 0;

  while (scrollLoopActive && collectedIds.size < limit) {
    const countBefore = document.querySelectorAll('article[data-testid="tweet"]').length;

    // Scroll one step
    // const scrollStep = rand(500, 1000)
    window.scrollBy({ top: SCROLL_STEP, behavior: 'smooth' });

    // Wait for Twitter to inject new articles (or timeout)
    const countAfter = await waitForNewContent(countBefore);
    const domGrew    = countAfter > countBefore;

    // Extract whatever is visible now
    const added = extractAndSend();

    console.log(
      `[Bookmarks] Collected ${collectedIds.size} / ${limit}` +
      (added > 0 ? ` (+${added} new)` : ' — no new this step')
    );

    if (!domGrew && added === 0) {
      stallCount++;
      console.log(`[Bookmarks] Stall ${stallCount}/${STALL_LIMIT}`);
      if (stallCount >= STALL_LIMIT) {
        console.warn('[Bookmarks] No new content loading — stopping early.');
        break;
      }
    } else {
      stallCount = 0;
    }

    if (collectedIds.size >= limit) break;

    // Human-like random pause before next scroll
    await sleep(rand(MIN_DELAY, MAX_DELAY));
  }

  console.log(
    `%c[Bookmarks] Done. Total unique bookmarks collected: ${collectedIds.size}`,
    'font-weight:bold; color:#1d9bf0'
  );

  scrollLoopActive   = false;
  autoExtractRunning = false;

  // Notify popup so it can update its UI
  chrome.runtime.sendMessage({ type: 'AUTO_EXTRACT_FINISHED', total: collectedIds.size });
}

// ── Start / stop ─────────────────────────────────────────────

function startAutoExtraction(limit = MAX_BOOKMARKS) {
  if (autoExtractRunning) return;
  autoExtractRunning = true;
  scrollLoopActive   = true;

  // Do an immediate extraction pass before the first scroll
  extractAndSend();

  autoScrollLoop(limit);
  console.log('[Bookmarks] Auto-extraction enabled');
}

function stopAutoExtraction() {
  if (!autoExtractRunning) return;
  scrollLoopActive   = false;
  autoExtractRunning = false;
  console.log('[Bookmarks] Auto-extraction stopped');
}

// Expose extraction functions globally for scripting injection
window.startAutoExtraction = startAutoExtraction;
window.stopAutoExtraction = stopAutoExtraction;

// ── Lifecycle & messaging ────────────────────────────────────

function checkAndStartAutoExtract() {
  const isEnabled = localStorage.getItem(AUTO_EXTRACT_KEY) === 'true';
  if (isEnabled && !autoExtractRunning) startAutoExtraction();
  else if (!isEnabled && autoExtractRunning) stopAutoExtraction();
}

window.addEventListener('storage', e => {
  if (e.key === AUTO_EXTRACT_KEY) checkAndStartAutoExtract();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'CHECK_AUTO_EXTRACT':
      checkAndStartAutoExtract();
      sendResponse({ running: autoExtractRunning });
      break;

    case 'START_AUTO_EXTRACT':
      localStorage.setItem(AUTO_EXTRACT_KEY, 'true');
      // Use limit from popup if provided, otherwise fall back to the constant at the top
      startAutoExtraction(message.maxBookmarks || MAX_BOOKMARKS);
      sendResponse({ success: true });
      break;

    case 'STOP_AUTO_EXTRACT':
      localStorage.setItem(AUTO_EXTRACT_KEY, 'false');
      stopAutoExtraction();
      sendResponse({ success: true });
      break;
  }
  return true;
});

// Start on page load if the toggle was left on
checkAndStartAutoExtract();