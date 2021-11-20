'use strict';

// Context Menu
{
  const callback = () => {
    chrome.contextMenus.create({
      id: 'copy-plain',
      title: 'Copy plain text to the clipboard',
      contexts: ['selection']
    });
    chrome.contextMenus.create({
      id: 'remove-formating',
      title: 'Remove Formating',
      contexts: ['selection']
    });
  };
  chrome.runtime.onInstalled.addListener(callback);
  chrome.runtime.onStartup.addListener(callback);
}
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const method = info.menuItemId || '';
  let selected = info.selectionText;

  // get selected text
  const a = await chrome.scripting.executeScript({
    target: {
      tabId: tab.id,
      frameIds: [info.frameId]
    },
    func: () => window.getSelection().toString().trim()
  }).catch(e => {
    console.warn('cannot use window.getSelection()', e);
    return;
  });
  if (a && a.length && a[0].result) {
    selected = a[0].result;
  }

  if (method === 'copy-plain') {
    await chrome.tabs.update(tab.id, {
      highlighted: true
    });
    await chrome.windows.update(tab.windowId, {
      focused: true
    });
    chrome.scripting.executeScript({
      target: {
        tabId: tab.id
      },
      func: msg => {
        navigator.clipboard.writeText(msg).then(() => {
          const t = document.title;
          document.title = 'Selected text is copied as plain text';
          setTimeout(() => document.title = t, 750);
        }).catch(e => alert(e.message));
      },
      args: [selected]
    });
  }
  else if (method === 'remove-formating') {
    chrome.scripting.executeScript({
      target: {
        tabId: tab.id,
        frameIds: [info.frameId]
      },
      func: str => {
        const selected = window.getSelection();
        const aElement = document.activeElement;

        if (selected && selected.rangeCount) {
          const run = document.execCommand('insertText', null, str);
          if (run === false) {
            const range = selected.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(str));
          }
        }
        else if (aElement && 'selectionStart' in aElement && aElement.selectionStart !== aElement.selectionEnd) {
          const value = aElement.value;
          const {selectionStart, selectionEnd} = aElement;
          aElement.value = value.slice(0, selectionStart) + str + value.slice(selectionEnd);
          Object.assign(aElement, {
            selectionStart,
            selectionEnd: selectionStart + str.length
          });
        }
      },
      args: [selected]
    }).catch(e => {
      console.warn(e);
      chrome.scripting.executeScript({
        target: {
          tabId: tab.id
        },
        func: str => alert(str),
        args: [e.message]
      });
    });
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
            tabs.query({active: true, currentWindow: true}, tbs => tabs.create({
              url: page + '?version=' + version + (previousVersion ? '&p=' + previousVersion : '') + '&type=' + reason,
              active: reason === 'install',
              ...(tbs && tbs.length && {index: tbs[0].index + 1})
            }));
            storage.local.set({'last-update': Date.now()});
          }
        }
      }));
    });
    setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
  }
}
