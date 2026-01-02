document.getElementById('extractBtn').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  const gallery = document.getElementById('gallery');
  
  statusDiv.className = 'loading';
  statusDiv.textContent = 'Extracting images from bookmarks...';
  gallery.innerHTML = '';
  
  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Check if we're on the bookmarks page
    if (!tab.url.includes('/bookmarks')) {
      statusDiv.className = 'error';
      statusDiv.textContent = 'Please navigate to your Twitter/X bookmarks page first!';
      return;
    }
    
    // Execute the content script to extract images
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractImages
    });
    
    const images = results[0].result;
    
    if (images.length === 0) {
      statusDiv.className = 'error';
      statusDiv.textContent = 'No images found. Try scrolling down to load more bookmarks first.';
      return;
    }
    
    statusDiv.className = 'success';
    statusDiv.textContent = `Found ${images.length} images!`;
    
    // Display images in gallery
    images.forEach(imgUrl => {
      const item = document.createElement('div');
      item.className = 'gallery-item';
      
      const img = document.createElement('img');
      img.src = imgUrl;
      img.alt = 'Bookmark image';
      
      // Click to open full size in new tab
      item.addEventListener('click', () => {
        window.open(imgUrl, '_blank');
      });
      
      item.appendChild(img);
      gallery.appendChild(item);
    });
    
  } catch (error) {
    statusDiv.className = 'error';
    statusDiv.textContent = `Error: ${error.message}`;
    console.error(error);
  }
});

// This function runs in the context of the Twitter page
function extractImages() {
  const images = new Set();
  
  // Twitter/X uses different selectors, we'll try multiple approaches
  const selectors = [
    'article img[src*="media"]',  // Standard tweet images
    'article img[alt="Image"]',    // Alt text based
    'div[data-testid="tweetPhoto"] img', // Photo container
    'a[href*="/photo/"] img'       // Photo links
  ];
  
  selectors.forEach(selector => {
    const imgElements = document.querySelectorAll(selector);
    imgElements.forEach(img => {
      let src = img.src;
      
      // Get higher quality version by removing size params
      if (src.includes('pbs.twimg.com')) {
        src = src.split('?')[0] + '?format=jpg&name=large';
      }
      
      // Filter out profile pictures and small images
      if (src.includes('/media/') || src.includes('pbs.twimg.com/media')) {
        images.add(src);
      }
    });
  });
  
  return Array.from(images);
}