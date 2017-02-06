//
// chrome.devtools.inspectedWindow.tabId
//

// return the same id the same time
const data = { inspectedWindow: { tabId: 1 } };
data.__setTabId = function(id) { data.inspectedWindow.tabId = id; }; // eslint-disable-line

// exported
export const devtools = data;
