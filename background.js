/* globals safe */
'use strict';

var notify = message => chrome.notifications.create({
  title: chrome.runtime.getManifest().name,
  type: 'basic',
  iconUrl: 'data/icons/48.png',
  message
});

var storage = {};

function tab() {
  return new Promise((resolve, reject) => chrome.tabs.query({
    active: true,
    currentWindow: true
  }, tabs => {
    if (tabs && tabs.length) {
      resolve(tabs[0]);
    }
    else {
      reject(new Error('No active tab is detected'));
    }
  }));
}

function copy(str, tabId, msg) {
  if (/Firefox/.test(navigator.userAgent)) {
    const id = Math.random();
    storage[id] = str;
    const run = tabId => chrome.tabs.executeScript(tabId, {
      allFrames: false,
      runAt: 'document_start',
      code: `
        chrome.runtime.sendMessage({
          method: 'vars',
          id: ${id}
        }, password => {
          document.oncopy = (event) => {
            event.clipboardData.setData('text/plain', password);
            event.preventDefault();
          };
          window.focus();
          document.execCommand('Copy', false, null);
        });
      `
    }, () => {
      notify(chrome.runtime.lastError ? 'Cannot copy to the clipboard on this page!' : msg);
    });
    if (tabId) {
      run(tabId);
    }
    else {
      tab().then(tab => run(tab.id)).catch(e => notify(e.message));
    }
  }
  else {
    document.oncopy = e => {
      e.clipboardData.setData('text/plain', str);
      e.preventDefault();
      notify(msg);
    };
    document.execCommand('Copy', false, null);
  }
}
chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.method === 'vars') {
    response(storage[request.id]);
    // multiple requests may need this value
    window.setTimeout(() => delete storage[request.id], 2000);
  }
});

var replace = (str, tabId) => {
  const id = Math.random();
  storage[id] = str;
  chrome.tabs.executeScript(tabId, {
    allFrames: true,
    code: `{
      const selected = window.getSelection();
      const aElement = document.activeElement;
      if (selected && selected.rangeCount) {
        chrome.runtime.sendMessage({
          method: 'vars',
          id: ${id}
        }, str => {
          const run = document.execCommand('insertText', null, str);
          if (run === false) {
            const range = selected.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(str));
          }
        });
      }
      else if (aElement && 'selectionStart' in aElement && aElement.selectionStart !== aElement.selectionEnd) {
        chrome.runtime.sendMessage({
          method: 'vars',
          id: ${id}
        }, str => {
          const value = aElement.value;
          const {selectionStart, selectionEnd} = aElement;
          aElement.value = value.slice(0, selectionStart) + str + value.slice(selectionEnd);
          Object.assign(aElement, {
            selectionStart,
            selectionEnd: selectionStart + str.length
          });
        });
      }
  }`});
};

// Context Menu
{
  const callback = () => {
    chrome.contextMenus.create({
      id: 'remove-formating',
      title: 'Remove Formating',
      contexts: ['selection']
    });
    chrome.contextMenus.create({
      id: 'copy-plain',
      title: 'Copy plain text to the clipboard',
      contexts: ['selection']
    });
  };
  chrome.runtime.onInstalled.addListener(callback);
  chrome.runtime.onStartup.addListener(callback);
}
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const method = info.menuItemId || '';
  const selected = info.selectionText;
  if (method === 'copy-plain') {
    copy(selected, tab.id, 'Selected text is copied as plain text');
  }
  else if (method === 'remove-formating') {
    replace(selected, tab.id);
  }
});

// FAQs & Feedback
chrome.storage.local.get({
  'version': null,
  'faqs': navigator.userAgent.indexOf('Firefox') === -1,
  'last-update': 0,
}, prefs => {
  const version = chrome.runtime.getManifest().version;

  if (prefs.version ? (prefs.faqs && prefs.version !== version) : true) {
    const now = Date.now();
    const doUpdate = (now - prefs['last-update']) / 1000 / 60 / 60 / 24 > 30;
    chrome.storage.local.set({
      version,
      'last-update': doUpdate ? Date.now() : prefs['last-update']
    }, () => {
      // do not display the FAQs page if last-update occurred less than 30 days ago.
      if (doUpdate) {
        const p = Boolean(prefs.version);
        chrome.tabs.create({
          url: chrome.runtime.getManifest().homepage_url + '?version=' + version +
            '&type=' + (p ? ('upgrade&p=' + prefs.version) : 'install'),
          active: p === false
        });
      }
    });
  }
});

{
  const {name, version} = chrome.runtime.getManifest();
  chrome.runtime.setUninstallURL(
    chrome.runtime.getManifest().homepage_url + '?rd=feedback&name=' + name + '&version=' + version
  );
}
