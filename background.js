// context menu 업데이트 함수
async function updateContextMenus() {
  // storage에서 언어 설정 가져오기
  const { lang } = await chrome.storage.local.get(["lang"]);
  const currentLang = lang || "en";
  
  // 해당 언어의 messages.json 로드
  let messages = {};
  try {
    const url = chrome.runtime.getURL(`_locales/${currentLang}/messages.json`);
    const response = await fetch(url);
    messages = await response.json();
  } catch (e) {
    // 실패하면 기본 언어(영어) 사용
    try {
      const url = chrome.runtime.getURL(`_locales/en/messages.json`);
      const response = await fetch(url);
      messages = await response.json();
    } catch (e2) {
      console.error("Failed to load messages:", e2);
    }
  }
  
  const getMessage = (key, fallback) => {
    return messages[key]?.message || fallback;
  };
  
  // context menu 업데이트
  chrome.contextMenus.update("linking-workspace", {
    title: getMessage("linking_workspace", "Linking Workspace")
  });
  
  chrome.contextMenus.update("add-highlight", {
    title: getMessage("nav_highlights", "하이라이트")
  });
  
  chrome.contextMenus.update("add-readlater", {
    title: getMessage("contextmenu_readlater", "나중에 보기 - Linking")
  });
}

// 초기 설치 시 context menu 생성
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: "linking-workspace",
      title: "Linking Workspace",
      contexts: ["selection", "page"]
    });
    
    chrome.contextMenus.create({
      id: "add-highlight",
      parentId: "linking-workspace",
      title: "하이라이트",
      contexts: ["selection"]
    });
    
    chrome.contextMenus.create({
      id: "add-readlater",
      parentId: "linking-workspace",
      title: "나중에 보기 - Linking",
      contexts: ["page"]
    });
    
    // 언어에 맞게 업데이트
    updateContextMenus();
  });

// 단축키 핸들러
chrome.commands.onCommand.addListener((command) => {
  if (command === "_execute_action") {
    // 항상 별도 창으로 열기 (기본 동작)
    chrome.windows.create({
      url: chrome.runtime.getURL("popup.html?window=true"),
      type: "normal",
      width: 1200,
      height: 700,
      focused: true
    }, (win) => {
      if (chrome.runtime.lastError) {
        console.error("Failed to open window:", chrome.runtime.lastError);
      }
    });
  }
});
  
  function cleanUrl(raw) {
    const url = new URL(raw);
    [...url.searchParams.keys()].forEach(k => {
      if (
        k.startsWith("utm") ||
        k === "ref" ||
        k === "fbclid"
      ) {
        url.searchParams.delete(k);
      }
    });
    return url.toString();
  }
  
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "add-highlight") {
      // 선택된 텍스트가 있을 때만 하이라이트 추가
      if (info.selectionText) {
        chrome.tabs.sendMessage(tab.id, { type: "ADD_HIGHLIGHT" }, (response) => {
          if (chrome.runtime.lastError) {
            // content script가 없으면 주입 후 재시도
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ["content.js"]
            }, () => {
              if (!chrome.runtime.lastError) {
                setTimeout(() => {
                  chrome.tabs.sendMessage(tab.id, { type: "ADD_HIGHLIGHT" });
                }, 100);
              }
            });
          }
        });
      }
    } else if (info.menuItemId === "add-readlater") {
      // 현재 페이지를 나중에 보기에 추가
      if (!tab?.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) {
        return;
      }
      
      // 페이지 정보 가져오기
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({ title: document.title, url: location.href })
      }, (res) => {
        if (chrome.runtime.lastError || !res?.[0]?.result) {
          return;
        }
        
        const pageInfo = res[0].result;
        if (!pageInfo?.url) return;
        
        // popup을 열고 이름 입력 모달 표시
        chrome.windows.create({
          url: chrome.runtime.getURL("popup.html?window=true&readlater=true"),
          type: "normal",
          width: 1200,
          height: 700,
          focused: true
        }, (win) => {
          if (win && !chrome.runtime.lastError) {
            // popup이 완전히 로드될 때까지 기다린 후 메시지 전송
            // 여러 번 시도하여 안정성 확보
            let attempts = 0;
            const maxAttempts = 10;
            const trySendMessage = () => {
              attempts++;
              chrome.runtime.sendMessage({ 
                type: "SHOW_READLATER_MODAL", 
                info: pageInfo 
              }, (response) => {
                if (chrome.runtime.lastError && attempts < maxAttempts) {
                  // 아직 준비되지 않았으면 재시도
                  setTimeout(trySendMessage, 200);
                }
              });
            };
            setTimeout(trySendMessage, 800);
          }
        });
      });
    }
  });
  
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "HIGHLIGHT_ADDED") {
      // 하이라이트가 추가되었다는 알림 (팝업이 열려있을 경우 업데이트를 위해)
      sendResponse({ ok: true });
      return true;
    }
    
    if (msg.type === "READLATER_ADDED") {
      // 나중에 보기가 추가되었다는 알림 (팝업이 열려있을 경우 업데이트를 위해)
      sendResponse({ ok: true });
      return true;
    }
    
    if (msg.type === "UPDATE_SHORTCUT") {
      // 단축키는 manifest.json에서만 설정 가능하므로, 사용자에게 안내만 제공
      // 실제로는 chrome://extensions/shortcuts 페이지로 이동하도록 안내
      sendResponse({ ok: true, note: "Please set shortcut in chrome://extensions/shortcuts" });
      return true;
    }
    
    if (msg.type === "UPDATE_CONTEXT_MENU") {
      // popup에서 언어 변경 시 context menu 업데이트
      updateContextMenus();
      sendResponse({ ok: true });
      return true;
    }
    
    if (msg.type === "CLEAN_COPY") {
      const rawUrl = msg.url;
      const cleaned = cleanUrl(rawUrl);

      // 팝업에서 보내면 sender.tab이 없을 수 있어서 tabId를 우선 사용하고,
      // 없으면 현재 활성 탭을 찾아서 처리한다.
      const run = (tabId) => {
        chrome.scripting.executeScript(
          {
            target: { tabId },
            func: (txt) => navigator.clipboard.writeText(txt),
            args: [cleaned]
          },
          () => {
            // 복사 실패(권한/제약 페이지 등)도 있을 수 있음
            sendResponse({ ok: !chrome.runtime.lastError, cleaned, error: chrome.runtime.lastError?.message });
          }
        );
      };

      if (msg.tabId) {
        run(msg.tabId);
        return true;
      }

      if (sender?.tab?.id) {
        run(sender.tab.id);
        return true;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs?.[0];
        if (!tab?.id) {
          sendResponse({ ok: false, cleaned, error: "No active tab" });
          return;
        }
        run(tab.id);
      });
      return true;
    }
  });
  
  // 새 탭이 완전히 로드될 때 전역 설정 적용
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
      if (!tab.url.startsWith("chrome://") && !tab.url.startsWith("chrome-extension://") && !tab.url.startsWith("edge://") && !tab.url.startsWith("about:")) {
        chrome.storage.local.get(["globalAdsRemoved"], (res) => {
          if (res.globalAdsRemoved) {
            chrome.tabs.sendMessage(tabId, { type: "REMOVE_ADS", enabled: true }).catch(() => {});
          }
        });
      }
    }
  });
  