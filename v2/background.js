'use strict';

const notify = message => chrome.notifications.create({
  title: chrome.runtime.getManifest().name,
  type: 'basic',
  iconUrl: 'data/icons/48.png',
  message
});

const storage = {};

function copy(str, msg) {
  if (/Firefox/.test(navigator.userAgent)) {
    const id = Math.random();
    storage[id] = str;
    chrome.tabs.executeScript({
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

const replace = (str, frameId) => {
  const id = Math.random();
  storage[id] = str;
  chrome.tabs.executeScript({
    frameId,
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
chrome.contextMenus.onClicked.addListener(info => {
  const method = info.menuItemId || '';
  const selected = info.selectionText;
  if (method === 'copy-plain') {
    copy(selected, 'Selected text is copied as plain text');
  }
  else if (method === 'remove-formating') {
    replace(selected, info.frameId);
  }
});

/* FAQs & Feedback */
{
  const {management, runtime: {onInstalled, setUninstallURL, getManifest}, storage, tabs} = chrome;
  if (navigator.webdriver !== true) {
    const page = getManifest().homepage_url;
    const {name, version} = getManifest();
    onInstalled.addListener(({reason, previousVersion}) => {
      management.getSelf(({installType}) => installType === 'normal' && storage.local.get({
        'faqs': true,
        'last-update': 0
      }, prefs => {
        if (reason === 'install' || (prefs.faqs && reason === 'update')) {
          const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
          if (doUpdate && previousVersion !== version) {
            tabs.create({
              url: page + '?version=' + version + (previousVersion ? '&p=' + previousVersion : '') + '&type=' + reason,
              active: reason === 'install'
            });
            storage.local.set({'last-update': Date.now()});
          }
        }
      }));
    });
    setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
  }
}
