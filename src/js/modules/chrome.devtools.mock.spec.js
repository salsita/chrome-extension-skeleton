import assert from 'assert';
import { devtools } from './chrome.devtools.mock';

describe('chrome.devtools.mock module', () => {
  it('should export static data structure', () => {
    const id = 10;
    assert(typeof devtools === 'object');
    devtools.__setTabId(id); // eslint-disable-line
    assert(typeof devtools.inspectedWindow === 'object');
    assert(id === devtools.inspectedWindow.tabId);
  });
});
