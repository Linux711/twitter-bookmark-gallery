// Storage key
const STORAGE_KEY = 'twitterBookmarks';

// Current view state
let currentView = 'current';
let lastExtractedData = [];

// Load saved data from localStorage
function loadSavedData() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : {};
}

// Save data to localStorage
function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// Update stats display
function updateStats() {
  const saved = loadSavedData();
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

// Render gallery
function renderGallery(tweets, showSavedBadge = false) {
  const gallery = document.getElementById('gallery');
  gallery.innerHTML = '';
  
  if (tweets.length === 0) {
    gallery.innerHTML = '<div style="text-align: center; color: #8899a6; padding: 40px;">No tweets to display</div>';
    return;
  }
  
  tweets.forEach(tweet => {
    tweet.images.forEach((imgUrl, idx) => {
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
      
      // Click image to open full size
      item.querySelector('.gallery-image img').addEventListener('click', () => {
        window.open(imgUrl, '_blank');
      });
      
      gallery.appendChild(item);
    });
  });
}

// Extract button
document.getElementById('extractBtn').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  const gallery = document.getElementById('gallery');
  
  statusDiv.className = 'loading';
  statusDiv.textContent = 'Extracting bookmarks...';
  gallery.innerHTML = '';
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes('/bookmarks')) {
      statusDiv.className = 'error';
      statusDiv.textContent = 'Please navigate to your Twitter/X bookmarks page first!';
      return;
    }
    
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractBookmarks
    });
    
    const extractedTweets = results[0].result;
    
    if (extractedTweets.length === 0) {
      statusDiv.className = 'error';
      statusDiv.textContent = 'No bookmarks found. Try scrolling to load more.';
      return;
    }
    
    // Load existing data
    const savedData = loadSavedData();
    
    // Check for new vs existing
    let newCount = 0;
    let existingCount = 0;
    
    extractedTweets.forEach(tweet => {
      if (!savedData[tweet.tweetId]) {
        savedData[tweet.tweetId] = {
          ...tweet,
          savedAt: new Date().toISOString()
        };
        newCount++;
      } else {
        existingCount++;
      }
    });
    
    // Save updated data
    saveData(savedData);
    
    // Show results
    statusDiv.className = 'success';
    statusDiv.innerHTML = `
      Found ${extractedTweets.length} tweets:<br>
      ✅ ${newCount} new | ⏭️ ${existingCount} already saved
    `;
    
    // Store and display current extraction
    lastExtractedData = extractedTweets;
    renderGallery(extractedTweets, existingCount > 0);
    updateStats();
    
    // Switch to current view
    currentView = 'current';
    document.getElementById('viewCurrentBtn').classList.add('active');
    document.getElementById('viewAllBtn').classList.remove('active');
    
  } catch (error) {
    statusDiv.className = 'error';
    statusDiv.textContent = `Error: ${error.message}`;
    console.error(error);
  }
});

// Open full gallery button
document.getElementById('openGalleryBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('gallery.html') });
});

// View toggle buttons
document.getElementById('viewCurrentBtn').addEventListener('click', () => {
  currentView = 'current';
  document.getElementById('viewCurrentBtn').classList.add('active');
  document.getElementById('viewAllBtn').classList.remove('active');
  renderGallery(lastExtractedData);
});

document.getElementById('viewAllBtn').addEventListener('click', () => {
  currentView = 'all';
  document.getElementById('viewAllBtn').classList.add('active');
  document.getElementById('viewCurrentBtn').classList.remove('active');
  
  const savedData = loadSavedData();
  const allTweets = Object.values(savedData);
  renderGallery(allTweets, true);
});

// Export button
document.getElementById('exportBtn').addEventListener('click', () => {
  const data = loadSavedData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `twitter-bookmarks-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  const statusDiv = document.getElementById('status');
  statusDiv.className = 'success';
  statusDiv.textContent = 'Exported successfully!';
});

// Clear button
document.getElementById('clearBtn').addEventListener('click', () => {
  if (confirm('Are you sure you want to clear all saved bookmarks?')) {
    localStorage.removeItem(STORAGE_KEY);
    lastExtractedData = [];
    document.getElementById('gallery').innerHTML = '';
    updateStats();
    
    const statusDiv = document.getElementById('status');
    statusDiv.className = 'success';
    statusDiv.textContent = 'All data cleared.';
  }
});

// Initialize on load
updateStats();

// Function that runs in Twitter page context
function extractBookmarks() {
  const tweets = [];
  const seenIds = new Set();
  
  // Find all tweet articles
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  
  articles.forEach(article => {
    try {
      // Get tweet URL and ID
      const tweetLink = article.querySelector('a[href*="/status/"]');
      if (!tweetLink) return;
      
      const tweetUrl = tweetLink.href;
      const tweetId = tweetUrl.match(/status\/(\d+)/)?.[1];
      if (!tweetId || seenIds.has(tweetId)) return;
      seenIds.add(tweetId);
      
      // Get author info
      const authorLink = article.querySelector('a[href^="/"][href*="/status/"]:not([href*="/status/"])');
      const author = authorLink?.href.split('/')[3] || 'unknown';
      const authorUrl = `https://twitter.com/${author}`;
      
      // Get tweet text
      const textElement = article.querySelector('[data-testid="tweetText"]');
      const text = textElement?.textContent || '';
      
      // Get all images
      const images = [];
      const imgElements = article.querySelectorAll('img[src*="media"]');
      
      imgElements.forEach(img => {
        let src = img.src;
        
        // Get highest quality version
        if (src.includes('pbs.twimg.com/media')) {
          src = src.split('?')[0] + '?format=jpg&name=large';
          
          // Avoid profile pictures
          if (!images.includes(src)) {
            images.push(src);
          }
        }
      });
      
      // Only add if has images
      if (images.length > 0) {
        tweets.push({
          tweetId,
          tweetUrl,
          author,
          authorUrl,
          text: text.substring(0, 200), // Truncate long tweets
          images
        });
      }
      
    } catch (error) {
      console.error('Error parsing tweet:', error);
    }
  });
  
  return tweets;
}