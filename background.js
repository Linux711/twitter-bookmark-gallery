// Background script to handle auto-extraction messages
const STORAGE_KEY = 'twitterBookmarks';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'AUTO_EXTRACT') {
    handleAutoExtract(message.tweets).then(result => {
      sendResponse(result);
    });
    return true; // Keep message channel open for async response
  }
});

async function handleAutoExtract(tweets) {
  // Get existing data
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const savedData = result[STORAGE_KEY] || {};
  
  let newCount = 0;
  
  tweets.forEach(tweet => {
    if (!savedData[tweet.tweetId]) {
      savedData[tweet.tweetId] = {
        ...tweet,
        savedAt: new Date().toISOString()
      };
      newCount++;
    }
  });
  
  if (newCount > 0) {
    await chrome.storage.local.set({ [STORAGE_KEY]: savedData });
  }
  
  return { newCount, totalCount: Object.keys(savedData).length };
}