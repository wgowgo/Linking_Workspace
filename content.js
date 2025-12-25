// 중복 주입 방지: 이미 선언되었는지 확인
if (typeof window.adsRemoved === 'undefined') {
  window.adsRemoved = false;
}

// 페이지 로드 시 전역 설정 적용 (기본값은 true)
chrome.storage.local.get(["globalAdsRemoved"], (res) => {
  if (res.globalAdsRemoved !== false) { // 기본값은 true
    window.adsRemoved = true;
    removeAds();
  }
});


function removeAds() {
  // 광고만 제거 (팝업 광고, 구글 애드 등)
  const selectors = [
    // 구글 애드센스 (모든 변형)
    ".adsbygoogle",
    "#google_ads",
    "[id*='google_ads']",
    "[class*='google-ad']",
    "[id*='google-ad']",
    "[class*='google_ads']",
    "[id*='google_ads']",
    "[class*='adsbygoogle']",
    "[id*='adsbygoogle']",
    "[data-ad-client]",
    "[data-ad-slot]",
    "[data-ad]",
    "[data-adsbygoogle-status]",
    "[data-ad-format]",
    "[data-ad-layout]",
    "[data-ad-layout-key]",
    "[data-full-width-responsive]",
    "[id^='google_ads_iframe']",
    "[id^='google_ads_frame']",
    "[id*='google_ads_iframe']",
    "[id*='google_ads_frame']",
    "[class*='google-auto-placed']",
    "[id*='google-auto-placed']",
    
    // 광고 iframe (구글 광고 포함)
    "iframe[src*='ads']",
    "iframe[src*='ad']",
    "iframe[src*='doubleclick']",
    "iframe[src*='googlesyndication']",
    "iframe[src*='advertising']",
    "iframe[src*='googleadservices']",
    "iframe[src*='googletagservices']",
    "iframe[src*='googleads']",
    "iframe[id*='google_ads']",
    "iframe[id*='adsbygoogle']",
    "iframe[data-ad-client]",
    "iframe[data-ad-slot]",
    
    // 광고 클래스/ID (더 구체적으로)
    "[class*='ad-banner']",
    "[id*='ad-banner']",
    "[class*='advertisement']:not([class*='content']):not([class*='main'])",
    "[id*='advertisement']:not([id*='content']):not([id*='main'])",
    "[class*='ad-container']",
    "[id*='ad-container']",
    "[class*='ad-wrapper']",
    "[id*='ad-wrapper']",
    "[class*='ads-container']",
    "[id*='ads-container']",
    "[class*='sponsored']",
    "[id*='sponsored']",
    "[class*='ad-unit']",
    "[id*='ad-unit']",
    "[class*='ad-box']",
    "[id*='ad-box']",
    "[class*='ad-block']",
    "[id*='ad-block']",
    
    // 팝업 광고
    "[class*='popup']:not([class*='content']):not([class*='main']):not([class*='search'])",
    "[id*='popup']:not([id*='content']):not([id*='main']):not([id*='search'])",
    "[class*='modal']:not([class*='content']):not([class*='main']):not([class*='search'])",
    "[id*='modal']:not([id*='content']):not([id*='main']):not([id*='search'])",
    "[class*='overlay']:not([class*='content']):not([class*='main'])",
    "[id*='overlay']:not([id*='content']):not([id*='main'])"
  ];
  
  // 구글 광고 스크립트 차단
  try {
    document.querySelectorAll("script[src*='adsbygoogle'], script[src*='googlesyndication'], script[src*='doubleclick']").forEach(script => {
      if (script.parentNode) {
        script.remove();
      }
    });
  } catch (e) {}
  
  // 구글 광고 div 직접 찾기 (ins 태그 등)
  try {
    document.querySelectorAll("ins.adsbygoogle, div[id*='google_ads'], div[class*='adsbygoogle'], div[data-ad-client]").forEach(el => {
      if (el.closest("article, main, [role='main'], .content, #content")) return;
      if (el.style.display === 'none' && el.getAttribute("data-cleanread-hidden") === "true") return;
      if (!el.hasAttribute("data-cleanread-original-display")) {
        const originalDisplay = window.getComputedStyle(el).display;
        el.setAttribute("data-cleanread-original-display", originalDisplay);
      }
      el.style.display = "none";
      el.setAttribute("data-cleanread-hidden", "true");
    });
  } catch (e) {}
  
  let removedCount = 0;
  selectors.forEach(sel => {
    try {
      document.querySelectorAll(sel).forEach(el => {
        // 본문 내부는 절대 제외
        if (el.closest("article, main, [role='main'], .content, #content")) return;
        // 검색창, 네비게이션 등 유용한 요소는 제외
        if (el.closest("nav, header, form, input[type='search'], input[type='text']")) {
          // 검색창이나 입력 필드가 포함된 경우 제외
          if (el.querySelector("input[type='search'], input[type='text'], form")) return;
        }
        // 이미 숨겨진 요소는 제외
        if (el.style.display === 'none' && el.getAttribute("data-cleanread-hidden") === "true") return;
        // 원래 display 값 저장 (복원을 위해)
        if (!el.hasAttribute("data-cleanread-original-display")) {
          const originalDisplay = window.getComputedStyle(el).display;
          el.setAttribute("data-cleanread-original-display", originalDisplay);
        }
        el.style.display = "none";
        el.setAttribute("data-cleanread-hidden", "true");
        removedCount++;
      });
    } catch (e) {}
  });
  
  return removedCount;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "REMOVE_ADS") {
    // enabled 값에 따라 토글
    window.adsRemoved = msg.enabled !== false; // 기본값은 true
    if (window.adsRemoved) {
      removeAds();
    } else {
      // 광고 제거 해제 (모든 요소 다시 표시)
      document.querySelectorAll("[data-cleanread-hidden='true']").forEach(el => {
        const originalDisplay = el.getAttribute("data-cleanread-original-display") || "";
        el.style.display = originalDisplay;
        el.removeAttribute("data-cleanread-hidden");
        el.removeAttribute("data-cleanread-original-display");
      });
    }
    
    // 전역 설정 저장
    chrome.storage.local.set({ globalAdsRemoved: window.adsRemoved });
    return true;
  }
  

  if (msg.type === "ADD_HIGHLIGHT") {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) {
      // 선택 영역이 없으면 에러 메시지 표시하지 않고 조용히 리턴
      return;
    }

    const name = prompt("하이라이트 이름 (선택사항):");
    if (name === null) {
      // 사용자가 취소 버튼을 눌렀을 때
      sel.removeAllRanges();
      return;
    }
    
    const description = prompt("설명 (선택사항):");
    if (description === null) {
      // 사용자가 취소 버튼을 눌렀을 때
      sel.removeAllRanges();
      return;
    }

    try {
      const range = sel.getRangeAt(0);
      
      // 범위가 유효한지 확인
      if (!range || range.collapsed) {
        sel.removeAllRanges();
        return;
      }

      // 선택된 텍스트 저장
      const selectedText = range.toString().trim();
      if (!selectedText) {
        sel.removeAllRanges();
        return;
      }

      // 하이라이트 span 생성
      const span = document.createElement("span");
      span.className = "cleanread-highlight";
      span.style.backgroundColor = "#ffe066";
      span.style.cursor = "pointer";
      if (name) span.title = name;
      span.textContent = selectedText;

      try {
        // surroundContents 시도 (단일 요소에 걸쳐 있을 때만 작동)
        range.surroundContents(span);
      } catch (e) {
        // surroundContents가 실패하면 (여러 요소에 걸쳐 있을 때)
        // 범위의 내용을 삭제하고 span으로 교체
        try {
          // 범위의 내용을 삭제하고 span 삽입
          range.deleteContents();
          range.insertNode(span);
        } catch (e2) {
          // 이것도 실패하면 더 안전한 방법 사용
          // 범위의 공통 조상 컨테이너 찾기
          const commonAncestor = range.commonAncestorContainer;
          
          if (commonAncestor.nodeType === Node.TEXT_NODE) {
            // 텍스트 노드인 경우
            const parent = commonAncestor.parentNode;
            if (parent) {
              const textContent = commonAncestor.textContent;
              const before = textContent.substring(0, range.startOffset);
              const after = textContent.substring(range.endOffset);
              
              // 기존 텍스트 노드를 분할하여 span 삽입
              const textBefore = document.createTextNode(before);
              const textAfter = document.createTextNode(after);
              
              parent.replaceChild(textBefore, commonAncestor);
              parent.insertBefore(span, textBefore.nextSibling);
              if (after) {
                parent.insertBefore(textAfter, span.nextSibling);
              }
            }
          } else {
            // 요소 노드인 경우 - 범위 시작 위치에 삽입
            const startContainer = range.startContainer;
            if (startContainer.nodeType === Node.TEXT_NODE && startContainer.parentNode) {
              const parent = startContainer.parentNode;
              const textContent = startContainer.textContent;
              const before = textContent.substring(0, range.startOffset);
              const after = textContent.substring(range.endOffset);
              
              const textBefore = document.createTextNode(before);
              const textAfter = document.createTextNode(after);
              
              parent.replaceChild(textBefore, startContainer);
              parent.insertBefore(span, textBefore.nextSibling);
              if (after) {
                parent.insertBefore(textAfter, span.nextSibling);
              }
            } else {
              // 최후의 수단: 범위 시작 위치에 삽입 시도
              range.collapse(true);
              range.insertNode(span);
            }
          }
        }
      }
      
      sel.removeAllRanges();

      const data = {
        id: `highlight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        url: location.href,
        text: selectedText,
        name: name || "",
        description: description || "",
        createdAt: Date.now(),
        folderId: null,
        order: 0
      };

      chrome.storage.local.get("highlights", res => {
        const arr = Array.isArray(res.highlights) ? res.highlights : [];
        arr.push(data);
        chrome.storage.local.set({ highlights: arr }, () => {
          // 저장 완료 후 팝업에 알림 (팝업이 열려있을 경우)
          chrome.runtime.sendMessage({ type: "HIGHLIGHT_ADDED" }).catch(() => {
            // 팝업이 닫혀있으면 에러가 발생할 수 있지만 무시
          });
        });
      });
    } catch (e) {
      // 범위가 유효하지 않을 때 (예: 여러 요소에 걸쳐 있을 때)
      console.error("Failed to highlight:", e);
      sel.removeAllRanges();
    }
  }
});
