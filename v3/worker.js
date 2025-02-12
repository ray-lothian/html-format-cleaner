'use strict';

const notify = async message => {
  const url = '/data/alert/index.html?message=' + encodeURIComponent(message);

  const win = await chrome.windows.getCurrent();

  const prefs = await chrome.storage.local.get({
    width: 600,
    height: 200
  });
  const left = win.left + Math.round((win.width - prefs.width) / 2);
  const top = win.top + Math.round((win.height - prefs.height) / 2);

  chrome.windows.create({
    url,
    width: prefs.width,
    height: prefs.height,
    left,
    top,
    type: 'popup'
  });
};

// Context Menu
{
  const startup = () => {
    if (startup.once) {
      return;
    }
    startup.once = true;

    chrome.contextMenus.create({
      id: 'copy-plain',
      title: 'Copy plain text to the clipboard',
      contexts: ['selection'],
      documentUrlPatterns: ['*://*/*']
    }, () => chrome.runtime.lastError);
    chrome.contextMenus.create({
      id: 'remove-formatting',
      title: 'Remove formatting',
      contexts: ['selection'],
      documentUrlPatterns: ['*://*/*']
    }, () => chrome.runtime.lastError);
  };
  chrome.runtime.onInstalled.addListener(startup);
  chrome.runtime.onStartup.addListener(startup);
}
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const method = info.menuItemId;

  if (method === 'copy-plain') {
    try {
      await chrome.tabs.update(tab.id, {
        highlighted: true
      });
      await chrome.windows.update(tab.windowId, {
        focused: true
      });
      await chrome.scripting.executeScript({
        target: {
          tabId: tab.id
        },
        func: msg => {
          msg = getSelection().toString().trim() || msg;

          window.focus();
          navigator.clipboard.writeText(msg).then(() => {
            const t = document.title;
            document.title = 'Done!';
            setTimeout(() => document.title = t, 750);
          }).catch(e => alert(e.message));
        },
        args: [info.selectionText],
        injectImmediately: true
      });
    }
    catch (e) {
      try {
        // Firefox backup plan
        await navigator.clipboard.writeText(info.selectionText);
      }
      catch (ee) {
        notify(e.message);
        console.error(e);
      }
    }
  }
  else if (method === 'remove-formatting') {
    chrome.scripting.executeScript({
      target: {
        tabId: tab.id,
        frameIds: [info.frameId]
      },
      func: str => {
        const selected = getSelection();
        const aElement = document.activeElement;
        str = selected.toString() || str;

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
      args: [info.selectionText],
      injectImmediately: true
    }).catch(e => {
      notify(e.message);
      console.error(e);
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.method === 'close') {
    chrome.tabs.remove(sender.tab.id);
  }
});

/* FAQs & Feedback */
{
  const {management, runtime: {onInstalled, setUninstallURL, getManifest}, storage, tabs} = chrome;
  if (navigator.webdriver !== true) {
    const {homepage_url: page, name, version} = getManifest();
    onInstalled.addListener(({reason, previousVersion}) => {
      management.getSelf(({installType}) => installType === 'normal' && storage.local.get({
        'faqs': true,
        'last-update': 0
      }, prefs => {
        if (reason === 'install' || (prefs.faqs && reason === 'update')) {
          const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
          if (doUpdate && previousVersion !== version) {
            tabs.query({active: true, lastFocusedWindow: true}, tbs => tabs.create({
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
