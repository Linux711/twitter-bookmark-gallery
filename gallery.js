const STORAGE_KEY = 'twitterBookmarks';
const THEME_KEY = 'twitterBookmarksTheme';
const GRID_SIZE_KEY = 'twitterBookmarksGridSize';

let allTweets = [];
let filteredTweets = [];

// Theme toggle
function initTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
    document.querySelector('.theme-icon').textContent = '☀️';
  }
}

// Grid size control
function initGridSize() {
  const savedSize = localStorage.getItem(GRID_SIZE_KEY) || '280';
  const gallery = document.getElementById('gallery');
  const slider = document.getElementById('gridSize');
  const sizeLabel = document.getElementById('gridSizeValue');
  
  slider.value = savedSize;
  sizeLabel.textContent = `${savedSize}px`;
  gallery.style.setProperty('--grid-size', `${savedSize}px`);
}

document.getElementById('gridSize').addEventListener('input', (e) => {
  const size = e.target.value;
  const gallery = document.getElementById('gallery');
  const sizeLabel = document.getElementById('gridSizeValue');
  
  sizeLabel.textContent = `${size}px`;
  gallery.style.setProperty('--grid-size', `${size}px`);
  localStorage.setItem(GRID_SIZE_KEY, size);
});

document.getElementById('themeToggle').addEventListener('click', () => {
  document.body.classList.toggle('light-mode');
  const isLight = document.body.classList.contains('light-mode');
  localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark');
  document.querySelector('.theme-icon').textContent = isLight ? '☀️' : '🌙';
});

// Load data from localStorage
function loadData() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : {};
}

// Update stats
function updateStats() {
  const totalImages = allTweets.reduce((sum, t) => sum + t.images.length, 0);
  
  document.getElementById('totalCount').textContent = `${allTweets.length} tweets`;
  document.getElementById('imageCount').textContent = `${totalImages} images`;
  
  if (filteredTweets.length !== allTweets.length) {
    document.getElementById('filteredCount').textContent = `(showing ${filteredTweets.length})`;
  } else {
    document.getElementById('filteredCount').textContent = '';
  }
}

// Format date
function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

// Render gallery
function renderGallery(tweets) {
  const gallery = document.getElementById('gallery');
  gallery.innerHTML = '';
  
  if (tweets.length === 0) {
    gallery.innerHTML = `
      <div class="empty-state">
        <h2>No bookmarks saved yet</h2>
        <p>Use the extension popup to extract images from your Twitter bookmarks</p>
      </div>
    `;
    return;
  }
  
  tweets.forEach(tweet => {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    
    const firstImage = tweet.images[0];
    const imageCount = tweet.images.length;
    
    item.innerHTML = `
      <div class="gallery-image" data-images='${JSON.stringify(tweet.images)}' data-tweet='${JSON.stringify(tweet)}'>
        <img src="${firstImage}" alt="Tweet image" loading="lazy">
        ${imageCount > 1 ? `<div class="image-count-badge">+${imageCount - 1} more</div>` : ''}
      </div>
      <div class="gallery-info">
        <div class="author">
          <div class="author-avatar">${tweet.author[0].toUpperCase()}</div>
          <a href="${tweet.authorUrl}" target="_blank">@${tweet.author}</a>
        </div>
        ${tweet.text ? `<div class="tweet-text">${tweet.text}</div>` : ''}
        <div class="saved-date">Saved ${formatDate(tweet.savedAt)}</div>
        <div class="links">
          <a href="${tweet.tweetUrl}" target="_blank">View Tweet</a>
          ${imageCount > 1 ? `<a href="#" class="view-all-images">View All ${imageCount} Images</a>` : ''}
        </div>
      </div>
    `;
    
    // Click image to open lightbox
    const imgElement = item.querySelector('.gallery-image');
    imgElement.addEventListener('click', () => {
      openLightbox(firstImage, tweet);
    });
    
    // Handle "view all images" for multi-image tweets
    const viewAllBtn = item.querySelector('.view-all-images');
    if (viewAllBtn) {
      viewAllBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showAllImages(tweet);
      });
    }
    
    gallery.appendChild(item);
  });
}

// Show all images from a tweet
function showAllImages(tweet) {
  const gallery = document.getElementById('gallery');
  gallery.innerHTML = '';
  
  // Add back button
  const backBtn = document.createElement('div');
  backBtn.innerHTML = `
    <button id="backToGallery" style="margin-bottom: 20px;">← Back to Gallery</button>
  `;
  gallery.appendChild(backBtn);
  
  document.getElementById('backToGallery').addEventListener('click', () => {
    renderGallery(filteredTweets);
  });
  
  // Show all images
  tweet.images.forEach((imgUrl, idx) => {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    
    item.innerHTML = `
      <div class="gallery-image">
        <img src="${imgUrl}" alt="Tweet image ${idx + 1}" loading="lazy">
      </div>
      <div class="gallery-info">
        <div class="author">
          <div class="author-avatar">${tweet.author[0].toUpperCase()}</div>
          <a href="${tweet.authorUrl}" target="_blank">@${tweet.author}</a>
        </div>
        <div class="links">
          <a href="${tweet.tweetUrl}" target="_blank">View Tweet</a>
          <a href="${imgUrl}" target="_blank">Full Image</a>
        </div>
      </div>
    `;
    
    item.querySelector('.gallery-image').addEventListener('click', () => {
      openLightbox(imgUrl, tweet);
    });
    
    gallery.appendChild(item);
  });
}

// Open lightbox
function openLightbox(imgUrl, tweet) {
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  
  lightboxImg.src = imgUrl;
  lightbox.classList.add('active');
  
  document.getElementById('lightboxTweet').href = tweet.tweetUrl;
  document.getElementById('lightboxImage').href = imgUrl;
  document.getElementById('lightboxAuthor').href = tweet.authorUrl;
}

// Close lightbox
document.querySelector('.lightbox-close').addEventListener('click', () => {
  document.getElementById('lightbox').classList.remove('active');
});

document.getElementById('lightbox').addEventListener('click', (e) => {
  if (e.target.id === 'lightbox') {
    document.getElementById('lightbox').classList.remove('active');
  }
});

// Search functionality
document.getElementById('searchInput').addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase();
  
  if (!query) {
    filteredTweets = [...allTweets];
  } else {
    filteredTweets = allTweets.filter(tweet => 
      tweet.author.toLowerCase().includes(query) ||
      tweet.text.toLowerCase().includes(query)
    );
  }
  
  applySorting();
  renderGallery(filteredTweets);
  updateStats();
});

// Sort functionality
document.getElementById('sortSelect').addEventListener('change', applySorting);

function applySorting() {
  const sortBy = document.getElementById('sortSelect').value;
  
  switch(sortBy) {
    case 'newest':
      filteredTweets.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
      break;
    case 'oldest':
      filteredTweets.sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));
      break;
    case 'author':
      filteredTweets.sort((a, b) => a.author.localeCompare(b.author));
      break;
  }
  
  renderGallery(filteredTweets);
}

// Export data
document.getElementById('exportBtn').addEventListener('click', () => {
  const data = loadData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `twitter-bookmarks-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// Import data
document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const importedData = JSON.parse(event.target.result);
      
      if (typeof importedData !== 'object') {
        throw new Error('Invalid data format');
      }
      
      const existingData = loadData();
      
      let newCount = 0;
      let updatedCount = 0;
      
      Object.keys(importedData).forEach(tweetId => {
        if (existingData[tweetId]) {
          updatedCount++;
        } else {
          newCount++;
        }
        existingData[tweetId] = importedData[tweetId];
      });
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existingData));
      
      // Refresh the view
      allTweets = Object.values(existingData);
      filteredTweets = [...allTweets];
      applySorting();
      updateStats();
      
      alert(`Import successful!\n✅ ${newCount} new tweets\n🔄 ${updatedCount} updated`);
      
      e.target.value = '';
      
    } catch (error) {
      alert(`Import failed: ${error.message}`);
    }
  };
  
  reader.onerror = () => {
    alert('Failed to read file');
  };
  
  reader.readAsText(file);
});

// Clear all data
document.getElementById('clearBtn').addEventListener('click', () => {
  if (confirm('Are you sure you want to clear all saved bookmarks? This cannot be undone.')) {
    localStorage.removeItem(STORAGE_KEY);
    allTweets = [];
    filteredTweets = [];
    renderGallery([]);
    updateStats();
  }
});

// Initialize
function init() {
  initTheme();
  initGridSize();
  const data = loadData();
  allTweets = Object.values(data);
  filteredTweets = [...allTweets];
  
  applySorting();
  updateStats();
}

init();