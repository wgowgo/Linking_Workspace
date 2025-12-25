import { loadLang } from "./i18n.js";

/* ------------------------------ Utils ------------------------------ */
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const storageGet = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
const storageSet = (obj) => new Promise((resolve) => chrome.storage.local.set(obj, resolve));

let I18N = {};
function t(key, fallback = "") {
  return I18N?.[key] || fallback || key;
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRestrictedUrl(url) {
  if (!url) return true;
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:")
  );
}

function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function cleanUrl(raw) {
  const url = new URL(raw);
  [...url.searchParams.keys()].forEach((k) => {
    if (k.startsWith("utm") || k === "ref" || k === "fbclid") url.searchParams.delete(k);
  });
  return url.toString();
}

/* ------------------------------ Folder Utils ------------------------------ */
async function createFolder(type, name) {
  const folder = {
    id: uid(),
    name: name || t("new_folder", "새 폴더"),
    createdAt: Date.now(),
    order: 0,
    collapsed: false
  };
  
  let storageKey;
  switch(type) {
    case "notes":
      folder.order = noteFolders.length;
      noteFolders.push(folder);
      storageKey = "noteFolders";
      await storageSet({ [storageKey]: noteFolders });
      break;
    case "tasks":
      folder.order = taskFolders.length;
      taskFolders.push(folder);
      storageKey = "taskFolders";
      await storageSet({ [storageKey]: taskFolders });
      break;
    case "highlights":
      folder.order = highlightFolders.length;
      highlightFolders.push(folder);
      storageKey = "highlightFolders";
      await storageSet({ [storageKey]: highlightFolders });
      break;
    case "readLater":
      folder.order = readLaterFolders.length;
      readLaterFolders.push(folder);
      storageKey = "readLaterFolders";
      await storageSet({ [storageKey]: readLaterFolders });
      break;
    default:
      return null;
  }
  
  return folder;
}

async function deleteFolder(type, folderId) {
  let folders, items, storageKey, itemKey;
  switch(type) {
    case "notes":
      folders = noteFolders;
      items = pages;
      storageKey = "noteFolders";
      itemKey = "pages";
      break;
    case "tasks":
      folders = taskFolders;
      items = tasks;
      storageKey = "taskFolders";
      itemKey = "tasks";
      break;
    case "highlights":
      folders = highlightFolders;
      items = highlights;
      storageKey = "highlightFolders";
      itemKey = "highlights";
      break;
    case "readLater":
      folders = readLaterFolders;
      items = readLater;
      storageKey = "readLaterFolders";
      itemKey = "readLater";
      break;
    default:
      return;
  }
  
  // 폴더 내 항목들을 루트로 이동
  items.forEach(item => {
    if (item.folderId === folderId) {
      item.folderId = null;
    }
  });
  
  // 폴더 삭제
  const index = folders.findIndex(f => f.id === folderId);
  if (index !== -1) {
    folders.splice(index, 1);
    await storageSet({ [storageKey]: folders, [itemKey]: items });
  }
}

async function moveItemToFolder(type, itemId, folderId) {
  let items, storageKey;
  switch(type) {
    case "notes":
      items = pages;
      storageKey = "pages";
      break;
    case "tasks":
      items = tasks;
      storageKey = "tasks";
      break;
    case "highlights":
      items = highlights;
      storageKey = "highlights";
      break;
    case "readLater":
      items = readLater;
      storageKey = "readLater";
      break;
    default:
      return;
  }
  
  const item = items.find(i => i.id === itemId);
  if (item) {
    item.folderId = folderId;
    await storageSet({ [storageKey]: items });
  }
}

async function updateItemOrder(type, itemIds) {
  let items, storageKey;
  switch(type) {
    case "notes":
      items = pages;
      storageKey = "pages";
      break;
    case "tasks":
      items = tasks;
      storageKey = "tasks";
      break;
    case "highlights":
      items = highlights;
      storageKey = "highlights";
      break;
    case "readLater":
      items = readLater;
      storageKey = "readLater";
      break;
    default:
      return;
  }
  
  itemIds.forEach((id, idx) => {
    const item = items.find(i => i.id === id);
    if (item) {
      item.order = idx;
    }
  });
  
  await storageSet({ [storageKey]: items });
}

let toastTimer = null;
function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 1600);
}

async function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs?.[0] || null));
  });
}

async function ensureContentScript(tabId) {
  // JS 주입 (content_scripts가 안 먹는 케이스 대비)
  await new Promise((resolve) => chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }, resolve));
  return !chrome.runtime.lastError;
}

async function sendMessageToTab(tab, message) {
  if (!tab?.id || isRestrictedUrl(tab.url)) {
    toast(t("toast_restricted", "이 페이지에서는 사용할 수 없어요."));
    return { ok: false, error: "restricted" };
  }

  const res = await new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, message, (response) => {
      if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message });
      resolve({ ok: true, response });
    });
  });

  if (res.ok) return res;

  // content script가 아직 없으면 동적 주입 후 재시도
  const injected = await ensureContentScript(tab.id);
  if (!injected) {
    toast(t("toast_inject_failed", "이 페이지에서는 실행할 수 없어요."));
    return { ok: false, error: "inject_failed" };
  }
  await sleep(50);
  return await new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, message, (response) => {
      if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message });
      resolve({ ok: true, response });
    });
  });
}

/* ------------------------------ i18n ------------------------------ */
const langSelect = $("langSelect");
async function initLang() {
  const { lang } = await storageGet(["lang"]);
  const next = lang || "en";
  // _locales에서 새로운 형식으로 로드
  try {
    const url = chrome.runtime.getURL(`_locales/${next}/messages.json`);
    const res = await fetch(url);
    const messages = await res.json();
    // Chrome i18n 형식을 간단한 key-value로 변환
    I18N = {};
    Object.keys(messages).forEach(key => {
      I18N[key] = messages[key].message;
    });
  } catch {
    // 폴백: 구버전 locales 시도
  try {
    const url = chrome.runtime.getURL(`locales/${next}.json`);
    const res = await fetch(url);
    I18N = await res.json();
  } catch {
    I18N = {};
    }
  }
  await loadLang(next);
  langSelect.value = next;
}

langSelect.onchange = async () => {
  await storageSet({ lang: langSelect.value });
  // _locales에서 새로운 형식으로 로드
  try {
    const url = chrome.runtime.getURL(`_locales/${langSelect.value}/messages.json`);
    const res = await fetch(url);
    const messages = await res.json();
    // Chrome i18n 형식을 간단한 key-value로 변환
    I18N = {};
    Object.keys(messages).forEach(key => {
      I18N[key] = messages[key].message;
    });
  } catch {
    // 폴백: 구버전 locales 시도
  try {
    const url = chrome.runtime.getURL(`locales/${langSelect.value}.json`);
    const res = await fetch(url);
    I18N = await res.json();
  } catch {
    I18N = {};
    }
  }
  await loadLang(langSelect.value);
  renderAll();
  
  // context menu도 업데이트
  chrome.runtime.sendMessage({ type: "UPDATE_CONTEXT_MENU" }).catch(() => {
    // background가 없을 수 있지만 무시
  });
};

/* ------------------------------ Theme ------------------------------ */
const themeToggle = $("themeToggle");
async function initTheme() {
  const { theme } = await storageGet(["theme"]);
  document.body.classList.toggle("theme-dark", theme === "dark");
}
themeToggle.onclick = async () => {
  const isDark = document.body.classList.toggle("theme-dark");
  await storageSet({ theme: isDark ? "dark" : "light" });
};

/* ------------------------------ Views ------------------------------ */
const viewTitle = $("viewTitle");
const viewActions = $("viewActions");
const navItems = Array.from(document.querySelectorAll(".nav-item"));
const views = {
  notes: $("view-notes"),
  tasks: $("view-tasks"),
  highlights: $("view-highlights"),
  readlater: $("view-readlater"),
  tools: $("view-tools"),
  settings: $("view-settings"),
  search: $("view-search")
};

let currentView = "notes";
function setView(name) {
  currentView = name;
  Object.entries(views).forEach(([k, el]) => {
    if (!el) return;
    el.hidden = k !== name;
  });
  navItems.forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  if (name === "search") {
    viewTitle.textContent = t("search_results", "검색 결과");
  } else {
    const btn = navItems.find((b) => b.dataset.view === name);
    viewTitle.textContent = btn ? btn.innerText.trim().replace(/\s+/g, " ") : name;
  }
  viewActions.innerHTML = "";
  
  // 하이라이트 뷰로 전환할 때 모달 확실히 닫기
  if (highlightDetailModal) {
    highlightDetailModal.hidden = true;
    highlightDetailModal.setAttribute("hidden", "");
  }
}

navItems.forEach((btn) => {
  btn.onclick = () => {
    const name = btn.dataset.view;
    setView(name);
    renderAll();
  };
});

/* ------------------------------ Notes (Pages) ------------------------------ */
const pageListEl = $("pageList");
const newPageBtn = $("newPageBtn");
const newFolderBtn = $("newFolderBtn");

// 폴더 생성 버튼
if (newFolderBtn) {
  newFolderBtn.onclick = async () => {
    const name = prompt(t("folder_name", "폴더 이름") + ":", t("new_folder", "새 폴더"));
    if (name && name.trim()) {
      const folder = await createFolder("notes", name.trim());
      if (folder) {
        toast(t("new_folder", "새 폴더") + " 생성됨: " + folder.name);
        renderPageList(pageSearchInput?.value || "");
      }
    }
  };
}
const deletePageBtn = $("deletePageBtn");
const pageTitleEl = $("pageTitle");
const pageContentEl = $("pageContent");
const saveStatusEl = $("saveStatus");
const pageSearchInput = $("pageSearchInput");
const pageSearchMode = $("pageSearchMode");
const pagePagination = $("pagePagination");

let pages = [];
let activePageId = null;
let saveDebounce = null;
let currentPageNum = 1;
let currentTaskPageNum = 1;
let currentHighlightPageNum = 1;
let currentReadLaterPageNum = 1;
const ITEMS_PER_PAGE = 10;

// 폴더 데이터 구조
let noteFolders = [];
let taskFolders = [];
let highlightFolders = [];
let readLaterFolders = [];

// 드래그 앤 드롭 상태
let draggedElement = null;
let draggedData = null;
let dragOverFolder = null;

function getActivePage() {
  return pages.find((p) => p.id === activePageId) || null;
}

async function loadNotes() {
  const res = await storageGet(["pages", "activePageId", "noteFolders"]);
  pages = Array.isArray(res.pages) ? res.pages : [];
  noteFolders = Array.isArray(res.noteFolders) ? res.noteFolders : [];
  activePageId = res.activePageId || pages[0]?.id || null;

  if (!activePageId) {
    const p = { id: uid(), title: "Untitled", content: "", createdAt: Date.now(), updatedAt: Date.now(), folderId: null, order: 0 };
    pages = [p];
    activePageId = p.id;
    await storageSet({ pages, activePageId });
  }
  
  // 기존 항목에 folderId와 order가 없으면 추가
  let needsUpdate = false;
  pages.forEach((p, idx) => {
    if (p.folderId === undefined) {
      p.folderId = null;
      p.order = idx;
      needsUpdate = true;
    }
  });
  if (needsUpdate) {
    await storageSet({ pages });
  }
}

function renderPageList(filterText = "") {
  const q = (filterText || "").trim().toLowerCase();
  const searchMode = pageSearchMode?.value || "both";
  
  // 검색 필터링
  let filteredList = pages;
  if (q) {
    filteredList = pages.filter((p) => {
      const title = (p.title || "").toLowerCase();
      const content = (p.content || "").toLowerCase();
      
      if (searchMode === "title") {
        return title.includes(q);
      } else if (searchMode === "content") {
        return content.includes(q);
      } else {
        return title.includes(q) || content.includes(q);
      }
    });
  }
  
  // 정렬
  const sortedList = filteredList
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
  
  // 폴더별로 그룹화
  const rootItems = sortedList.filter(p => !p.folderId);
  const folderMap = new Map();
  noteFolders.forEach(f => folderMap.set(f.id, { folder: f, items: [] }));
  sortedList.forEach(p => {
    if (p.folderId && folderMap.has(p.folderId)) {
      folderMap.get(p.folderId).items.push(p);
    }
  });
  
  // 폴더 정렬
  const sortedFolders = Array.from(folderMap.values())
    .sort((a, b) => (a.folder.order || 0) - (b.folder.order || 0));
  
  // 렌더링
  pageListEl.innerHTML = "";
  
  // 루트 항목 렌더링
  rootItems.forEach((p) => {
    const li = createPageListItem(p);
    pageListEl.appendChild(li);
  });
  
  // 폴더 렌더링
  sortedFolders.forEach(({ folder, items }) => {
    // 폴더 헤더를 리스트 아이템으로
    const folderHeaderLi = document.createElement("li");
    folderHeaderLi.className = "list-item folder-header-item";
    folderHeaderLi.dataset.folderId = folder.id;
    
    const folderHeader = document.createElement("div");
    folderHeader.className = "folder-header";
    folderHeader.style.display = "flex";
    folderHeader.style.alignItems = "center";
    folderHeader.style.gap = "8px";
    folderHeader.style.padding = "8px";
    folderHeader.style.cursor = "pointer";
    folderHeader.style.userSelect = "none";
    
    const folderIcon = document.createElement("span");
    folderIcon.textContent = folder.collapsed ? "▶" : "▼";
    folderIcon.style.width = "16px";
    folderIcon.style.textAlign = "center";
    
    const folderName = document.createElement("span");
    folderName.className = "item-title";
    folderName.textContent = folder.name;
    folderName.style.flex = "1";
    
    const folderCount = document.createElement("span");
    folderCount.className = "item-sub";
    folderCount.textContent = `(${items.length})`;
    folderCount.style.opacity = "0.7";
    folderCount.style.fontSize = "12px";
    
    const folderActions = document.createElement("div");
    folderActions.style.display = "flex";
    folderActions.style.gap = "4px";
    
    const renameFolderBtn = document.createElement("button");
    renameFolderBtn.className = "btn";
    renameFolderBtn.textContent = "✎";
    renameFolderBtn.style.padding = "2px 6px";
    renameFolderBtn.style.fontSize = "12px";
    renameFolderBtn.title = "이름 변경";
    renameFolderBtn.onclick = async (e) => {
      e.stopPropagation();
      const newName = prompt(t("folder_name", "폴더 이름") + ":", folder.name);
      if (newName && newName.trim() && newName !== folder.name) {
        folder.name = newName.trim();
        await storageSet({ noteFolders });
        renderPageList(pageSearchInput?.value || "");
      }
    };
    
    const deleteFolderBtn = document.createElement("button");
    deleteFolderBtn.className = "btn";
    deleteFolderBtn.textContent = "✕";
    deleteFolderBtn.style.padding = "2px 6px";
    deleteFolderBtn.style.fontSize = "12px";
    deleteFolderBtn.title = t("delete_folder", "폴더 삭제");
    deleteFolderBtn.onclick = async (e) => {
      e.stopPropagation();
      if (confirm(t("delete_folder_confirm", "폴더를 삭제하시겠습니까?"))) {
        await deleteFolder("notes", folder.id);
        renderPageList(pageSearchInput?.value || "");
      }
    };
    
    folderActions.appendChild(renameFolderBtn);
    folderActions.appendChild(deleteFolderBtn);
    folderHeader.appendChild(folderIcon);
    folderHeader.appendChild(folderName);
    folderHeader.appendChild(folderCount);
    folderHeader.appendChild(folderActions);
    
    folderHeader.onclick = () => {
      folder.collapsed = !folder.collapsed;
      storageSet({ noteFolders });
      renderPageList(pageSearchInput?.value || "");
    };
    
    // 폴더에 드롭 가능하도록
    folderHeader.ondragover = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      folderHeader.style.backgroundColor = "var(--bg-secondary, #f0f0f0)";
    };
    
    folderHeader.ondragleave = () => {
      folderHeader.style.backgroundColor = "";
    };
    
    folderHeader.ondrop = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      folderHeader.style.backgroundColor = "";
      if (draggedData && draggedData.type === "notes") {
        await moveItemToFolder("notes", draggedData.itemId, folder.id);
        renderPageList(pageSearchInput?.value || "");
        draggedElement = null;
        draggedData = null;
      }
    };
    
    folderHeaderLi.appendChild(folderHeader);
    pageListEl.appendChild(folderHeaderLi);
    
    // 폴더 내 항목들을 같은 레벨의 리스트 아이템으로 표시
    if (!folder.collapsed) {
      items.forEach((p) => {
        const itemLi = createPageListItem(p);
        itemLi.style.paddingLeft = "24px";
        itemLi.style.opacity = "0.9";
        pageListEl.appendChild(itemLi);
      });
      
      if (items.length === 0) {
        const emptyMsg = document.createElement("li");
        emptyMsg.className = "list-item";
        emptyMsg.style.padding = "8px 8px 8px 24px";
        emptyMsg.style.opacity = "0.5";
        emptyMsg.textContent = t("empty_folder", "빈 폴더");
        pageListEl.appendChild(emptyMsg);
      }
    }
  });
  
  // 페이지네이션은 폴더 구조에서는 비활성화 (전체 항목 수가 많아질 수 있음)
  pagePagination.hidden = true;
}

function createPageListItem(p) {
    const li = document.createElement("li");
    li.className = "list-item" + (p.id === activePageId ? " active" : "");
  li.draggable = true;
  li.dataset.itemId = p.id;
  
    const left = document.createElement("div");
    left.style.minWidth = "0";

    const titleEl = document.createElement("div");
    titleEl.className = "item-title";
    titleEl.textContent = p.title || "Untitled";

    const s = document.createElement("div");
    s.className = "item-sub";
    s.textContent = (p.content || "").replace(/\s+/g, " ").slice(0, 60);

    left.appendChild(titleEl);
    left.appendChild(s);

    li.appendChild(left);
  
  // 드래그 앤 드롭
  li.ondragstart = (e) => {
    draggedElement = li;
    draggedData = { type: "notes", itemId: p.id };
    e.dataTransfer.effectAllowed = "move";
  };
  
  li.ondragover = (e) => {
    e.preventDefault();
    if (draggedData && draggedData.type === "notes" && draggedData.itemId !== p.id) {
      const draggedItem = pages.find(i => i.id === draggedData.itemId);
      const targetItem = pages.find(i => i.id === p.id);
      // 같은 폴더 내에서만 드롭 가능 (둘 다 null이거나 같은 folderId)
      if (draggedItem && targetItem && draggedItem.folderId === targetItem.folderId) {
        e.dataTransfer.dropEffect = "move";
        li.style.borderTop = "2px solid var(--accent, #007bff)";
      } else {
        e.dataTransfer.dropEffect = "none";
        li.style.borderTop = "";
      }
    } else {
      e.dataTransfer.dropEffect = "none";
      li.style.borderTop = "";
    }
  };
  
  li.ondragleave = () => {
    li.style.borderTop = "";
  };
  
  li.ondrop = async (e) => {
    e.preventDefault();
    li.style.borderTop = "";
    if (draggedData && draggedData.type === "notes" && draggedData.itemId !== p.id) {
      // 순서 변경
      const draggedItem = pages.find(i => i.id === draggedData.itemId);
      const targetItem = pages.find(i => i.id === p.id);
      if (draggedItem && targetItem && draggedItem.folderId === targetItem.folderId) {
        // 같은 폴더 내에서만 순서 변경
        const draggedOrder = draggedItem.order || 0;
        const targetOrder = targetItem.order || 0;
        draggedItem.order = targetOrder;
        targetItem.order = draggedOrder;
        await storageSet({ pages });
        renderPageList(pageSearchInput?.value || "");
      }
      draggedElement = null;
      draggedData = null;
    }
  };
  
  li.onclick = async () => {
    activePageId = p.id;
    await storageSet({ activePageId });
    renderNotes();
  };
  
  return li;
}

function renderActivePageEditor() {
  const p = getActivePage();
  if (!p) return;
  pageTitleEl.value = p.title || "";
  pageContentEl.value = p.content || "";
  saveStatusEl.textContent = "";
}

async function persistActivePage(patch) {
  const p = getActivePage();
  if (!p) return;
  Object.assign(p, patch);
  p.updatedAt = Date.now();
  await storageSet({ pages });
}

function scheduleSave() {
  saveStatusEl.textContent = t("status_saving", "저장 중…");
  clearTimeout(saveDebounce);
  saveDebounce = setTimeout(async () => {
    await persistActivePage({ title: pageTitleEl.value.trim() || "Untitled", content: pageContentEl.value });
    saveStatusEl.textContent = t("status_saved", "저장");
    renderPageList(pageSearchInput?.value || "");
  }, 300);
}

pageTitleEl.addEventListener("input", scheduleSave);
pageContentEl.addEventListener("input", scheduleSave);

newPageBtn.onclick = async () => {
  const p = { id: uid(), title: "Untitled", content: "", createdAt: Date.now(), updatedAt: Date.now(), folderId: null, order: pages.length };
  pages.unshift(p);
  activePageId = p.id;
  currentPageNum = 1; // 새 페이지 생성 시 첫 페이지로
  await storageSet({ pages, activePageId });
  toast(t("toast_new_page", "새 페이지 생성"));
  renderNotes();
  // 새 페이지로 스크롤
  setTimeout(() => {
    const activeItem = pageListEl.querySelector(".list-item.active");
    if (activeItem) {
      activeItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, 100);
};

deletePageBtn.onclick = async () => {
  if (pages.length <= 1) {
    toast(t("toast_last_page", "마지막 페이지는 삭제할 수 없어요."));
    return;
  }
  
  const currentPage = getActivePage();
  const pageTitle = currentPage?.title || "Untitled";
  
  if (!confirm(t("delete_page_confirm", "페이지를 삭제하시겠습니까?") + `\n"${pageTitle}"`)) {
    return;
  }
  
  pages = pages.filter((p) => p.id !== activePageId);
  activePageId = pages[0]?.id || null;
  await storageSet({ pages, activePageId });
  toast(t("toast_deleted", "삭제됨"));
  renderNotes();
};

// 페이지 검색 이벤트
if (pageSearchInput) {
  pageSearchInput.addEventListener("input", () => {
    currentPageNum = 1; // 검색 시 첫 페이지로
    renderPageList(pageSearchInput.value);
  });
}

if (pageSearchMode) {
  pageSearchMode.addEventListener("change", () => {
    currentPageNum = 1; // 검색 모드 변경 시 첫 페이지로
    renderPageList(pageSearchInput?.value || "");
  });
}

function renderNotes() {
  renderPageList(pageSearchInput?.value || "");
  renderActivePageEditor();
}

/* ------------------------------ Tasks ------------------------------ */
const taskInputEl = $("taskInput");
const addTaskBtn = $("addTask");
const newTaskFolderBtn = $("newTaskFolderBtn");
const taskListEl = $("taskList");
const taskStatsEl = $("taskStats");
const taskPagination = $("taskPagination");

// 태스크 폴더 생성 버튼
if (newTaskFolderBtn) {
  newTaskFolderBtn.onclick = async () => {
    const name = prompt(t("folder_name", "폴더 이름") + ":", t("new_folder", "새 폴더"));
    if (name && name.trim()) {
      const folder = await createFolder("tasks", name.trim());
      if (folder) {
        toast(t("new_folder", "새 폴더") + " 생성됨: " + folder.name);
        renderTasks(globalSearchEl?.value || "");
      }
    }
  };
}

let tasks = [];

async function loadTasks() {
  const res = await storageGet(["tasks", "taskFolders"]);
  tasks = Array.isArray(res.tasks) ? res.tasks : [];
  taskFolders = Array.isArray(res.taskFolders) ? res.taskFolders : [];
  // 할 일 뷰가 활성화되어 있으면 렌더링
  if (currentView === "tasks") {
    renderTasks(globalSearchEl?.value || "");
  }
  
  // 기존 항목에 folderId와 order가 없으면 추가
  let needsUpdate = false;
  tasks.forEach((t, idx) => {
    if (t.folderId === undefined) {
      t.folderId = null;
      t.order = idx;
      needsUpdate = true;
    }
  });
  if (needsUpdate) {
    await storageSet({ tasks });
  }
}

async function saveTasks() {
  await storageSet({ tasks });
}

function renderTasks(filterText = "") {
  if (!taskListEl || !taskStatsEl) {
    console.error("taskListEl or taskStatsEl not found", { taskListEl, taskStatsEl });
    return;
  }
  
  const q = (filterText || "").trim().toLowerCase();
  let filteredList = tasks;
  if (q) {
    filteredList = tasks.filter((t) => (t.text || "").toLowerCase().includes(q));
  }
  
  // 정렬
  const sortedList = filteredList
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0) || (a.done === b.done ? (b.createdAt || 0) - (a.createdAt || 0) : a.done ? 1 : -1));
  
  // 폴더별로 그룹화
  const rootItems = sortedList.filter(t => !t.folderId);
  const folderMap = new Map();
  taskFolders.forEach(f => folderMap.set(f.id, { folder: f, items: [] }));
  sortedList.forEach(t => {
    if (t.folderId && folderMap.has(t.folderId)) {
      folderMap.get(t.folderId).items.push(t);
    }
  });
  
  // 폴더 정렬
  const sortedFolders = Array.from(folderMap.values())
    .sort((a, b) => (a.folder.order || 0) - (b.folder.order || 0));

  const done = tasks.filter((t) => t.done).length;
  if (taskStatsEl) {
    taskStatsEl.textContent = `${tasks.length}개 중 ${done}개 완료`;
  }

  taskListEl.innerHTML = "";
  
  // 루트 항목 렌더링
  rootItems.forEach((task) => {
    const li = createTaskListItem(task);
    taskListEl.appendChild(li);
  });
  
  // 폴더 렌더링
  sortedFolders.forEach(({ folder, items }) => {
    // 폴더 헤더를 리스트 아이템으로
    const folderHeaderLi = document.createElement("li");
    folderHeaderLi.className = "list-item folder-header-item";
    folderHeaderLi.dataset.folderId = folder.id;
    
    const folderHeader = document.createElement("div");
    folderHeader.className = "folder-header";
    folderHeader.style.display = "flex";
    folderHeader.style.alignItems = "center";
    folderHeader.style.gap = "8px";
    folderHeader.style.padding = "8px";
    folderHeader.style.cursor = "pointer";
    folderHeader.style.userSelect = "none";
    
    const folderIcon = document.createElement("span");
    folderIcon.textContent = folder.collapsed ? "▶" : "▼";
    folderIcon.style.width = "16px";
    
    const folderName = document.createElement("span");
    folderName.className = "item-title";
    folderName.textContent = folder.name;
    folderName.style.flex = "1";
    
    const folderCount = document.createElement("span");
    folderCount.className = "item-sub";
    folderCount.textContent = `(${items.length})`;
    folderCount.style.opacity = "0.7";
    folderCount.style.fontSize = "12px";
    
    const folderActions = document.createElement("div");
    folderActions.style.display = "flex";
    folderActions.style.gap = "4px";
    
    const renameBtn = document.createElement("button");
    renameBtn.className = "btn";
    renameBtn.textContent = "✎";
    renameBtn.style.padding = "2px 6px";
    renameBtn.style.fontSize = "12px";
    renameBtn.onclick = async (e) => {
      e.stopPropagation();
      const newName = prompt(t("folder_name", "폴더 이름") + ":", folder.name);
      if (newName && newName.trim() && newName !== folder.name) {
        folder.name = newName.trim();
        await storageSet({ taskFolders });
        renderTasks(globalSearchEl?.value || "");
      }
    };
    
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn";
    deleteBtn.textContent = "✕";
    deleteBtn.style.padding = "2px 6px";
    deleteBtn.style.fontSize = "12px";
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      if (confirm(t("delete_folder_confirm", "폴더를 삭제하시겠습니까?"))) {
        await deleteFolder("tasks", folder.id);
        renderTasks(globalSearchEl?.value || "");
      }
    };
    
    folderActions.appendChild(renameBtn);
    folderActions.appendChild(deleteBtn);
    folderHeader.appendChild(folderIcon);
    folderHeader.appendChild(folderName);
    folderHeader.appendChild(folderCount);
    folderHeader.appendChild(folderActions);
    
    folderHeader.onclick = () => {
      folder.collapsed = !folder.collapsed;
      storageSet({ taskFolders });
      renderTasks(globalSearchEl?.value || "");
    };
    
    folderHeader.ondragover = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      folderHeader.style.backgroundColor = "var(--bg-secondary, #f0f0f0)";
    };
    
    folderHeader.ondragleave = () => {
      folderHeader.style.backgroundColor = "";
    };
    
    folderHeader.ondrop = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      folderHeader.style.backgroundColor = "";
      if (draggedData && draggedData.type === "tasks") {
        await moveItemToFolder("tasks", draggedData.itemId, folder.id);
        renderTasks(globalSearchEl?.value || "");
        draggedElement = null;
        draggedData = null;
      }
    };
    
    folderHeaderLi.appendChild(folderHeader);
    taskListEl.appendChild(folderHeaderLi);
    
    // 폴더 내 항목들을 같은 레벨의 리스트 아이템으로 표시
    if (!folder.collapsed) {
      items.forEach((task) => {
        const itemLi = createTaskListItem(task);
        itemLi.style.paddingLeft = "24px";
        itemLi.style.opacity = "0.9";
        taskListEl.appendChild(itemLi);
      });
      
      if (items.length === 0) {
        const emptyMsg = document.createElement("li");
        emptyMsg.className = "list-item";
        emptyMsg.style.padding = "8px 8px 8px 24px";
        emptyMsg.style.opacity = "0.5";
        emptyMsg.textContent = t("empty_folder", "빈 폴더");
        taskListEl.appendChild(emptyMsg);
      }
    }
  });
  
  taskPagination.hidden = true;
}

function createTaskListItem(task) {
      const li = document.createElement("li");
      li.className = "list-item";
  li.draggable = true;
  li.dataset.itemId = task.id;

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.alignItems = "center";
      left.style.gap = "8px";
      left.style.minWidth = "0";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!task.done;
      cb.onchange = async () => {
        task.done = cb.checked;
        await saveTasks();
        renderTasks(globalSearchEl?.value || "");
      };

      const txt = document.createElement("div");
      txt.className = "item-title";
      txt.textContent = task.text;
      if (task.done) txt.style.opacity = "0.6";

      left.appendChild(cb);
      left.appendChild(txt);

      const actions = document.createElement("div");
      actions.className = "item-actions";

      const del = document.createElement("button");
      del.className = "btn danger";
      del.textContent = t("delete", "삭제");
      del.onclick = async (e) => {
        e.stopPropagation();
    if (!confirm(t("delete_task_confirm", "할 일을 삭제하시겠습니까?") + `\n"${task.text}"`)) {
      return;
    }
        tasks = tasks.filter((x) => x.id !== task.id);
        await saveTasks();
        renderTasks(globalSearchEl?.value || "");
      };
      actions.appendChild(del);

      li.appendChild(left);
      li.appendChild(actions);
  
  // 드래그 앤 드롭
  li.ondragstart = (e) => {
    draggedElement = li;
    draggedData = { type: "tasks", itemId: task.id };
    e.dataTransfer.effectAllowed = "move";
  };
  
  li.ondragover = (e) => {
    e.preventDefault();
    if (draggedData && draggedData.type === "tasks" && draggedData.itemId !== task.id) {
      const draggedItem = tasks.find(i => i.id === draggedData.itemId);
      const targetItem = tasks.find(i => i.id === task.id);
      // 같은 폴더 내에서만 드롭 가능 (둘 다 null이거나 같은 folderId)
      if (draggedItem && targetItem && draggedItem.folderId === targetItem.folderId) {
        e.dataTransfer.dropEffect = "move";
        li.style.borderTop = "2px solid var(--accent, #007bff)";
      } else {
        e.dataTransfer.dropEffect = "none";
        li.style.borderTop = "";
      }
    } else {
      e.dataTransfer.dropEffect = "none";
      li.style.borderTop = "";
    }
  };
  
  li.ondragleave = () => {
    li.style.borderTop = "";
  };
  
  li.ondrop = async (e) => {
    e.preventDefault();
    li.style.borderTop = "";
    if (draggedData && draggedData.type === "tasks" && draggedData.itemId !== task.id) {
      const draggedItem = tasks.find(i => i.id === draggedData.itemId);
      const targetItem = tasks.find(i => i.id === task.id);
      if (draggedItem && targetItem && draggedItem.folderId === targetItem.folderId) {
        const draggedOrder = draggedItem.order || 0;
        const targetOrder = targetItem.order || 0;
        draggedItem.order = targetOrder;
        targetItem.order = draggedOrder;
        await storageSet({ tasks });
        renderTasks(globalSearchEl?.value || "");
      }
      draggedElement = null;
      draggedData = null;
    }
  };
  
  return li;
}

addTaskBtn.onclick = async () => {
  const text = taskInputEl.value.trim();
  if (!text) return;
  
  // taskListEl이 없으면 다시 찾기
  if (!taskListEl) {
    const el = $("taskList");
    if (el) {
      taskListEl = el;
    }
  }
  
  tasks.unshift({ id: uid(), text, done: false, createdAt: Date.now() });
  taskInputEl.value = "";
  await saveTasks();
  
  // 할 일 뷰가 활성화되어 있지 않으면 활성화
  if (currentView !== "tasks") {
    setView("tasks");
  }
  
  // 약간의 지연 후 렌더링 (DOM 업데이트 대기)
  setTimeout(() => {
    renderTasks(globalSearchEl?.value || "");
  }, 0);
};

taskInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addTaskBtn.click();
});

/* ------------------------------ Highlights ------------------------------ */
const highlightSearchEl = $("highlightSearch");
const highlightListEl = $("highlightList");
const newHighlightFolderBtn = $("newHighlightFolderBtn");
const clearHighlightsBtn = $("clearHighlights");
const highlightPagination = $("highlightPagination");
const highlightDetailModal = $("highlightDetailModal");
const highlightDetailName = $("highlightDetailName");
const highlightDetailDescription = $("highlightDetailDescription");
const highlightDetailText = $("highlightDetailText");
const highlightDetailLink = $("highlightDetailLink");
const closeHighlightDetail = $("closeHighlightDetail");

// 하이라이트 폴더 생성 버튼
if (newHighlightFolderBtn) {
  newHighlightFolderBtn.onclick = async () => {
    const name = prompt(t("folder_name", "폴더 이름") + ":", t("new_folder", "새 폴더"));
    if (name && name.trim()) {
      const folder = await createFolder("highlights", name.trim());
      if (folder) {
        toast(t("new_folder", "새 폴더") + " 생성됨: " + folder.name);
        renderHighlights(highlightSearchEl?.value || "");
      }
    }
  };
}

let highlights = [];

async function loadHighlights() {
  const res = await storageGet(["highlights", "highlightFolders"]);
  highlights = Array.isArray(res.highlights) ? res.highlights : [];
  highlightFolders = Array.isArray(res.highlightFolders) ? res.highlightFolders : [];
  
  // 기존 항목에 id, folderId, order가 없으면 추가
  let needsUpdate = false;
  highlights.forEach((h, idx) => {
    if (!h.id) {
      h.id = `highlight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      needsUpdate = true;
    }
    if (h.folderId === undefined) {
      h.folderId = null;
      h.order = idx;
      needsUpdate = true;
    }
  });
  if (needsUpdate) {
    await storageSet({ highlights });
  }
}

async function saveHighlights() {
  await storageSet({ highlights });
}

function renderHighlights(filterText = "") {
  // 모달이 열려있으면 확실히 닫기
  if (highlightDetailModal) {
    highlightDetailModal.hidden = true;
    highlightDetailModal.setAttribute("hidden", "");
  }
  
  const q = (filterText || "").trim().toLowerCase();
  let filteredList = highlights;
  if (q) {
    filteredList = highlights.filter((h) => 
        (h.name || "").toLowerCase().includes(q) || 
        (h.description || "").toLowerCase().includes(q) ||
        (h.text || "").toLowerCase().includes(q) || 
      (h.note || "").toLowerCase().includes(q));
  }

  // 정렬
  const sortedList = filteredList
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0) || (b.createdAt || 0) - (a.createdAt || 0));
  
  // 폴더별로 그룹화
  const rootItems = sortedList.filter(h => !h.folderId);
  const folderMap = new Map();
  highlightFolders.forEach(f => folderMap.set(f.id, { folder: f, items: [] }));
  sortedList.forEach(h => {
    if (h.folderId && folderMap.has(h.folderId)) {
      folderMap.get(h.folderId).items.push(h);
    }
  });
  
  // 폴더 정렬
  const sortedFolders = Array.from(folderMap.values())
    .sort((a, b) => (a.folder.order || 0) - (b.folder.order || 0));
  
  highlightListEl.innerHTML = "";
  
  // 루트 항목 렌더링
  rootItems.forEach((h) => {
    const li = createHighlightListItem(h);
    highlightListEl.appendChild(li);
  });
  
  // 폴더 렌더링
  sortedFolders.forEach(({ folder, items }) => {
    // 폴더 헤더를 리스트 아이템으로
    const folderHeaderLi = document.createElement("li");
    folderHeaderLi.className = "list-item folder-header-item";
    folderHeaderLi.dataset.folderId = folder.id;
    
    const folderHeader = document.createElement("div");
    folderHeader.className = "folder-header";
    folderHeader.style.display = "flex";
    folderHeader.style.alignItems = "center";
    folderHeader.style.gap = "8px";
    folderHeader.style.padding = "8px";
    folderHeader.style.cursor = "pointer";
    folderHeader.style.userSelect = "none";
    
    const folderIcon = document.createElement("span");
    folderIcon.textContent = folder.collapsed ? "▶" : "▼";
    folderIcon.style.width = "16px";
    
    const folderName = document.createElement("span");
    folderName.className = "item-title";
    folderName.textContent = folder.name;
    folderName.style.flex = "1";
    
    const folderCount = document.createElement("span");
    folderCount.className = "item-sub";
    folderCount.textContent = `(${items.length})`;
    folderCount.style.opacity = "0.7";
    folderCount.style.fontSize = "12px";
    
    const folderActions = document.createElement("div");
    folderActions.style.display = "flex";
    folderActions.style.gap = "4px";
    
    const renameBtn = document.createElement("button");
    renameBtn.className = "btn";
    renameBtn.textContent = "✎";
    renameBtn.style.padding = "2px 6px";
    renameBtn.style.fontSize = "12px";
    renameBtn.onclick = async (e) => {
      e.stopPropagation();
      const newName = prompt(t("folder_name", "폴더 이름") + ":", folder.name);
      if (newName && newName.trim() && newName !== folder.name) {
        folder.name = newName.trim();
        await storageSet({ highlightFolders });
        renderHighlights(highlightSearchEl?.value || "");
      }
    };
    
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn";
    deleteBtn.textContent = "✕";
    deleteBtn.style.padding = "2px 6px";
    deleteBtn.style.fontSize = "12px";
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      if (confirm(t("delete_folder_confirm", "폴더를 삭제하시겠습니까?"))) {
        await deleteFolder("highlights", folder.id);
        renderHighlights(highlightSearchEl?.value || "");
      }
    };
    
    folderActions.appendChild(renameBtn);
    folderActions.appendChild(deleteBtn);
    folderHeader.appendChild(folderIcon);
    folderHeader.appendChild(folderName);
    folderHeader.appendChild(folderCount);
    folderHeader.appendChild(folderActions);
    
    folderHeader.onclick = () => {
      folder.collapsed = !folder.collapsed;
      storageSet({ highlightFolders });
      renderHighlights(highlightSearchEl?.value || "");
    };
    
    folderHeader.ondragover = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      folderHeader.style.backgroundColor = "var(--bg-secondary, #f0f0f0)";
    };
    
    folderHeader.ondragleave = () => {
      folderHeader.style.backgroundColor = "";
    };
    
    folderHeader.ondrop = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      folderHeader.style.backgroundColor = "";
      if (draggedData && draggedData.type === "highlights") {
        await moveItemToFolder("highlights", draggedData.itemId, folder.id);
        renderHighlights(highlightSearchEl?.value || "");
        draggedElement = null;
        draggedData = null;
      }
    };
    
    folderHeaderLi.appendChild(folderHeader);
    highlightListEl.appendChild(folderHeaderLi);
    
    // 폴더 내 항목들을 같은 레벨의 리스트 아이템으로 표시
    if (!folder.collapsed) {
      items.forEach((h) => {
        const itemLi = createHighlightListItem(h);
        itemLi.style.paddingLeft = "24px";
        itemLi.style.opacity = "0.9";
        highlightListEl.appendChild(itemLi);
      });
      
      if (items.length === 0) {
        const emptyMsg = document.createElement("li");
        emptyMsg.className = "list-item";
        emptyMsg.style.padding = "8px 8px 8px 24px";
        emptyMsg.style.opacity = "0.5";
        emptyMsg.textContent = t("empty_folder", "빈 폴더");
        highlightListEl.appendChild(emptyMsg);
      }
    }
  });
  
  highlightPagination.hidden = true;
}

function createHighlightListItem(h) {
      const li = document.createElement("li");
      li.className = "list-item";
  li.draggable = true;
  li.dataset.itemId = h.id;

      const left = document.createElement("div");
      left.style.minWidth = "0";

      const titleEl = document.createElement("div");
      titleEl.className = "item-title";
      titleEl.textContent = h.name || (h.text || "").replace(/\s+/g, " ").slice(0, 80) || "(empty)";

      const s = document.createElement("div");
      s.className = "item-sub";
      s.textContent = h.description || h.note || h.url;

      left.appendChild(titleEl);
      left.appendChild(s);

      const actions = document.createElement("div");
      actions.className = "item-actions";

      const open = document.createElement("button");
      open.className = "btn";
      open.textContent = t("open", "열기");
      open.onclick = (e) => {
        e.stopPropagation();
        showHighlightDetail(h);
      };

      const del = document.createElement("button");
      del.className = "btn danger";
      del.textContent = t("delete", "삭제");
      del.onclick = async (e) => {
        e.stopPropagation();
    const highlightName = h.name || (h.text || "").replace(/\s+/g, " ").slice(0, 50) || "(이름 없음)";
    if (!confirm(t("delete_highlight_confirm", "하이라이트를 삭제하시겠습니까?") + `\n"${highlightName}"`)) {
      return;
    }
    highlights = highlights.filter((x) => x.id !== h.id);
        await saveHighlights();
    renderHighlights(highlightSearchEl?.value || "");
      };

      actions.appendChild(open);
      actions.appendChild(del);

      li.appendChild(left);
      li.appendChild(actions);
      
      // 리스트 아이템 클릭 시 링크로 이동
      li.onclick = (e) => {
        // 버튼 클릭이 아닐 때만 링크로 이동
        if (!e.target.closest('button')) {
          if (h.url) {
            chrome.tabs.create({ url: h.url });
          }
        }
      };
      
  // 드래그 앤 드롭
  li.ondragstart = (e) => {
    draggedElement = li;
    draggedData = { type: "highlights", itemId: h.id };
    e.dataTransfer.effectAllowed = "move";
  };
  
  li.ondragover = (e) => {
    e.preventDefault();
    if (draggedData && draggedData.type === "highlights" && draggedData.itemId !== h.id) {
      const draggedItem = highlights.find(i => i.id === draggedData.itemId);
      const targetItem = highlights.find(i => i.id === h.id);
      // 같은 폴더 내에서만 드롭 가능 (둘 다 null이거나 같은 folderId)
      if (draggedItem && targetItem && draggedItem.folderId === targetItem.folderId) {
        e.dataTransfer.dropEffect = "move";
        li.style.borderTop = "2px solid var(--accent, #007bff)";
      } else {
        e.dataTransfer.dropEffect = "none";
        li.style.borderTop = "";
      }
    } else {
      e.dataTransfer.dropEffect = "none";
      li.style.borderTop = "";
    }
  };
  
  li.ondragleave = () => {
    li.style.borderTop = "";
  };
  
  li.ondrop = async (e) => {
    e.preventDefault();
    li.style.borderTop = "";
    if (draggedData && draggedData.type === "highlights" && draggedData.itemId !== h.id) {
      const draggedItem = highlights.find(i => i.id === draggedData.itemId);
      const targetItem = highlights.find(i => i.id === h.id);
      if (draggedItem && targetItem && draggedItem.folderId === targetItem.folderId) {
        const draggedOrder = draggedItem.order || 0;
        const targetOrder = targetItem.order || 0;
        draggedItem.order = targetOrder;
        targetItem.order = draggedOrder;
        await storageSet({ highlights });
        renderHighlights(highlightSearchEl?.value || "");
      }
      draggedElement = null;
      draggedData = null;
    }
  };
  
  return li;
}

function showHighlightDetail(h) {
  if (!highlightDetailModal || !highlightDetailName || !highlightDetailDescription || !highlightDetailText || !highlightDetailLink) {
    console.error("Highlight detail modal elements not found");
    return;
  }
  highlightDetailName.textContent = h.name || "(이름 없음)";
  highlightDetailDescription.textContent = h.description || h.note || "(설명 없음)";
  highlightDetailText.textContent = h.text || "(텍스트 없음)";
  highlightDetailLink.textContent = h.url || "";
  highlightDetailLink.href = h.url || "#";
  highlightDetailModal.hidden = false;
  highlightDetailModal.removeAttribute("hidden");
}

closeHighlightDetail.onclick = () => {
  if (highlightDetailModal) {
    highlightDetailModal.hidden = true;
    highlightDetailModal.setAttribute("hidden", "");
  }
};

highlightDetailLink.onclick = (e) => {
  e.preventDefault();
  if (highlightDetailLink.href && highlightDetailLink.href !== "#") {
    chrome.tabs.create({ url: highlightDetailLink.href });
  }
};

// 모달 배경 클릭 시 닫기
if (highlightDetailModal) {
  highlightDetailModal.onclick = (e) => {
    if (e.target === highlightDetailModal) {
      highlightDetailModal.hidden = true;
      highlightDetailModal.setAttribute("hidden", "");
    }
  };
}

highlightSearchEl.addEventListener("input", () => {
  currentHighlightPageNum = 1; // 검색 시 첫 페이지로
  renderHighlights(highlightSearchEl.value);
});

clearHighlightsBtn.onclick = async () => {
  if (highlights.length === 0) {
    toast(t("toast_no_highlights", "하이라이트가 없습니다."));
    return;
  }
  
  if (!confirm(t("clear_all_highlights_confirm", "모든 하이라이트 {count}개를 삭제하시겠습니까?").replace("{count}", String(highlights.length)))) {
    return;
  }
  
  highlights = [];
  await saveHighlights();
  toast(t("toast_cleared_all", "전체 삭제됨"));
  renderHighlights("");
};

/* ------------------------------ Read Later ------------------------------ */
const addReadLaterBtn = $("addReadLaterBtn");
const newReadLaterFolderBtn = $("newReadLaterFolderBtn");
const readLaterListEl = $("readLaterList");
const readLaterDetailModal = $("readLaterDetailModal");
const closeReadLaterDetail = $("closeReadLaterDetail");
const readLaterPagination = $("readLaterPagination");
const readLaterInputForm = $("readLaterInputForm");
const readLaterNameInput = $("readLaterNameInput");
const readLaterUrlInput = $("readLaterUrlInput");
const readLaterSaveBtn = $("readLaterSaveBtn");
const readLaterCancelBtn = $("readLaterCancelBtn");

// Read Later 폴더 생성 버튼
if (newReadLaterFolderBtn) {
  newReadLaterFolderBtn.onclick = async () => {
    const name = prompt(t("folder_name", "폴더 이름") + ":", t("new_folder", "새 폴더"));
    if (name && name.trim()) {
      const folder = await createFolder("readLater", name.trim());
      if (folder) {
        toast(t("new_folder", "새 폴더") + " 생성됨: " + folder.name);
        renderReadLater();
      }
    }
  };
}

if (closeReadLaterDetail) {
  closeReadLaterDetail.onclick = () => {
    if (readLaterDetailModal) {
      readLaterDetailModal.hidden = true;
      readLaterDetailModal.setAttribute("hidden", "");
    }
  };
}

if (readLaterDetailModal) {
  readLaterDetailModal.onclick = (e) => {
    if (e.target === readLaterDetailModal) {
      readLaterDetailModal.hidden = true;
      readLaterDetailModal.setAttribute("hidden", "");
    }
  };
}

// Read Later 추가 버튼
if (addReadLaterBtn) {
  addReadLaterBtn.onclick = () => {
    if (readLaterInputForm) {
      readLaterInputForm.style.display = readLaterInputForm.style.display === "none" ? "block" : "none";
      if (readLaterInputForm.style.display === "block") {
        readLaterNameInput.value = "";
        readLaterUrlInput.value = "";
        readLaterNameInput.focus();
      }
    }
  };
}

// Read Later 저장 버튼
if (readLaterSaveBtn) {
  readLaterSaveBtn.onclick = async () => {
    const name = readLaterNameInput.value.trim();
    let url = readLaterUrlInput.value.trim();
    
    if (!name) {
      toast(t("readlater_name_required", "이름을 입력하세요."));
      return;
    }
    
    if (!url) {
      toast(t("readlater_url_required", "URL을 입력하세요."));
      return;
    }
    
    // URL에 프로토콜이 없으면 http:// 추가
    if (!url.match(/^https?:\/\//i)) {
      url = "http://" + url;
    }
    
    try {
      // URL 유효성 검사
      new URL(url);
      
      const newItem = {
        id: uid(),
        title: name,
        url: url,
        createdAt: Date.now(),
        folderId: null,
        order: readLater.length
      };
      
      readLater.push(newItem);
      await saveReadLater();
      
      // 입력 폼 숨기기
      if (readLaterInputForm) {
        readLaterInputForm.style.display = "none";
      }
      readLaterNameInput.value = "";
      readLaterUrlInput.value = "";
      
      renderReadLater();
      toast(t("toast_readlater_added", "나중에 다시 보기에 추가됨"));
    } catch (e) {
      toast(t("readlater_invalid_url", "유효하지 않은 URL입니다."));
    }
  };
}

// Read Later 취소 버튼
if (readLaterCancelBtn) {
  readLaterCancelBtn.onclick = () => {
    if (readLaterInputForm) {
      readLaterInputForm.style.display = "none";
      readLaterNameInput.value = "";
      readLaterUrlInput.value = "";
    }
  };
}

let readLater = [];

async function loadReadLater() {
  const res = await storageGet(["readLater", "readLaterFolders"]);
  readLater = Array.isArray(res.readLater) ? res.readLater : [];
  readLaterFolders = Array.isArray(res.readLaterFolders) ? res.readLaterFolders : [];
  
  // 기존 항목에 folderId와 order가 없으면 추가
  let needsUpdate = false;
  readLater.forEach((r, idx) => {
    if (r.folderId === undefined) {
      r.folderId = null;
      r.order = idx;
      needsUpdate = true;
    }
  });
  if (needsUpdate) {
    await storageSet({ readLater });
  }
}

async function saveReadLater() {
  await storageSet({ readLater });
}

function renderReadLater() {
  // 정렬
  const sortedList = readLater
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0) || (b.createdAt || 0) - (a.createdAt || 0));
  
  // 폴더별로 그룹화
  const rootItems = sortedList.filter(r => !r.folderId);
  const folderMap = new Map();
  readLaterFolders.forEach(f => folderMap.set(f.id, { folder: f, items: [] }));
  sortedList.forEach(r => {
    if (r.folderId && folderMap.has(r.folderId)) {
      folderMap.get(r.folderId).items.push(r);
    }
  });
  
  // 폴더 정렬
  const sortedFolders = Array.from(folderMap.values())
    .sort((a, b) => (a.folder.order || 0) - (b.folder.order || 0));
  
  readLaterListEl.innerHTML = "";
  
  // 루트 항목 렌더링
  rootItems.forEach((item) => {
    const li = createReadLaterListItem(item);
    readLaterListEl.appendChild(li);
  });
  
  // 폴더 렌더링
  sortedFolders.forEach(({ folder, items }) => {
    // 폴더 헤더를 리스트 아이템으로
    const folderHeaderLi = document.createElement("li");
    folderHeaderLi.className = "list-item folder-header-item";
    folderHeaderLi.dataset.folderId = folder.id;
    
    const folderHeader = document.createElement("div");
    folderHeader.className = "folder-header";
    folderHeader.style.display = "flex";
    folderHeader.style.alignItems = "center";
    folderHeader.style.gap = "8px";
    folderHeader.style.padding = "8px";
    folderHeader.style.cursor = "pointer";
    folderHeader.style.userSelect = "none";
    
    const folderIcon = document.createElement("span");
    folderIcon.textContent = folder.collapsed ? "▶" : "▼";
    folderIcon.style.width = "16px";
    
    const folderName = document.createElement("span");
    folderName.className = "item-title";
    folderName.textContent = folder.name;
    folderName.style.flex = "1";
    
    const folderCount = document.createElement("span");
    folderCount.className = "item-sub";
    folderCount.textContent = `(${items.length})`;
    folderCount.style.opacity = "0.7";
    folderCount.style.fontSize = "12px";
    
    const folderActions = document.createElement("div");
    folderActions.style.display = "flex";
    folderActions.style.gap = "4px";
    
    const renameBtn = document.createElement("button");
    renameBtn.className = "btn";
    renameBtn.textContent = "✎";
    renameBtn.style.padding = "2px 6px";
    renameBtn.style.fontSize = "12px";
    renameBtn.onclick = async (e) => {
      e.stopPropagation();
      const newName = prompt(t("folder_name", "폴더 이름") + ":", folder.name);
      if (newName && newName.trim() && newName !== folder.name) {
        folder.name = newName.trim();
        await storageSet({ readLaterFolders });
        renderReadLater();
      }
    };
    
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn";
    deleteBtn.textContent = "✕";
    deleteBtn.style.padding = "2px 6px";
    deleteBtn.style.fontSize = "12px";
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      if (confirm(t("delete_folder_confirm", "폴더를 삭제하시겠습니까?"))) {
        await deleteFolder("readLater", folder.id);
        renderReadLater();
      }
    };
    
    folderActions.appendChild(renameBtn);
    folderActions.appendChild(deleteBtn);
    folderHeader.appendChild(folderIcon);
    folderHeader.appendChild(folderName);
    folderHeader.appendChild(folderCount);
    folderHeader.appendChild(folderActions);
    
    folderHeader.onclick = () => {
      folder.collapsed = !folder.collapsed;
      storageSet({ readLaterFolders });
      renderReadLater();
    };
    
    folderHeader.ondragover = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      folderHeader.style.backgroundColor = "var(--bg-secondary, #f0f0f0)";
    };
    
    folderHeader.ondragleave = () => {
      folderHeader.style.backgroundColor = "";
    };
    
    folderHeader.ondrop = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      folderHeader.style.backgroundColor = "";
      if (draggedData && draggedData.type === "readLater") {
        await moveItemToFolder("readLater", draggedData.itemId, folder.id);
        renderReadLater();
        draggedElement = null;
        draggedData = null;
      }
    };
    
    folderHeaderLi.appendChild(folderHeader);
    readLaterListEl.appendChild(folderHeaderLi);
    
    // 폴더 내 항목들을 같은 레벨의 리스트 아이템으로 표시
    if (!folder.collapsed) {
      items.forEach((item) => {
        const itemLi = createReadLaterListItem(item);
        itemLi.style.paddingLeft = "24px";
        itemLi.style.opacity = "0.9";
        readLaterListEl.appendChild(itemLi);
      });
      
      if (items.length === 0) {
        const emptyMsg = document.createElement("li");
        emptyMsg.className = "list-item";
        emptyMsg.style.padding = "8px 8px 8px 24px";
        emptyMsg.style.opacity = "0.5";
        emptyMsg.textContent = t("empty_folder", "빈 폴더");
        readLaterListEl.appendChild(emptyMsg);
      }
    }
  });
  
  readLaterPagination.hidden = true;
}

function createReadLaterListItem(item) {
      const li = document.createElement("li");
      li.className = "list-item";
  li.draggable = true;
  li.dataset.itemId = item.id;

      const left = document.createElement("div");
      left.style.minWidth = "0";
  left.style.flex = "1";
  left.style.overflow = "hidden";

      const titleEl = document.createElement("div");
      titleEl.className = "item-title";
  titleEl.textContent = item.title || "Untitled";
  titleEl.style.overflow = "hidden";
  titleEl.style.textOverflow = "ellipsis";
  titleEl.style.whiteSpace = "nowrap";

  const urlEl = document.createElement("div");
  urlEl.className = "item-sub";
  // URL을 짧게 표시 (도메인만 또는 처음 50자)
  try {
    const url = new URL(item.url);
    urlEl.textContent = url.hostname + url.pathname;
    if (urlEl.textContent.length > 50) {
      urlEl.textContent = urlEl.textContent.substring(0, 47) + "...";
    }
  } catch {
    urlEl.textContent = item.url.length > 50 ? item.url.substring(0, 47) + "..." : item.url;
  }
  urlEl.style.overflow = "hidden";
  urlEl.style.textOverflow = "ellipsis";
  urlEl.style.whiteSpace = "nowrap";
  urlEl.style.opacity = "0.7";
  urlEl.style.fontSize = "12px";

      left.appendChild(titleEl);
  left.appendChild(urlEl);

      const actions = document.createElement("div");
      actions.className = "item-actions";

      const open = document.createElement("button");
      open.className = "btn";
      open.textContent = t("open", "열기");
      open.onclick = (e) => {
        e.stopPropagation();
    showReadLaterDetail(item);
      };

      const del = document.createElement("button");
      del.className = "btn danger";
      del.textContent = t("delete", "삭제");
      del.onclick = async (e) => {
        e.stopPropagation();
        readLater = readLater.filter((x) => x.id !== item.id);
        await saveReadLater();
        renderReadLater();
      };

      actions.appendChild(open);
      actions.appendChild(del);

      li.appendChild(left);
      li.appendChild(actions);
  
  // 드래그 앤 드롭
  li.ondragstart = (e) => {
    draggedElement = li;
    draggedData = { type: "readLater", itemId: item.id };
    e.dataTransfer.effectAllowed = "move";
  };
  
  li.ondragover = (e) => {
    e.preventDefault();
    if (draggedData && draggedData.type === "readLater" && draggedData.itemId !== item.id) {
      const draggedItem = readLater.find(i => i.id === draggedData.itemId);
      const targetItem = readLater.find(i => i.id === item.id);
      // 같은 폴더 내에서만 드롭 가능 (둘 다 null이거나 같은 folderId)
      if (draggedItem && targetItem && draggedItem.folderId === targetItem.folderId) {
        e.dataTransfer.dropEffect = "move";
        li.style.borderTop = "2px solid var(--accent, #007bff)";
      } else {
        e.dataTransfer.dropEffect = "none";
        li.style.borderTop = "";
      }
    } else {
      e.dataTransfer.dropEffect = "none";
      li.style.borderTop = "";
    }
  };
  
  li.ondragleave = () => {
    li.style.borderTop = "";
  };
  
  li.ondrop = async (e) => {
    e.preventDefault();
    li.style.borderTop = "";
    if (draggedData && draggedData.type === "readLater" && draggedData.itemId !== item.id) {
      const draggedItem = readLater.find(i => i.id === draggedData.itemId);
      const targetItem = readLater.find(i => i.id === item.id);
      if (draggedItem && targetItem && draggedItem.folderId === targetItem.folderId) {
        const draggedOrder = draggedItem.order || 0;
        const targetOrder = targetItem.order || 0;
        draggedItem.order = targetOrder;
        targetItem.order = draggedOrder;
        await storageSet({ readLater });
        renderReadLater();
      }
      draggedElement = null;
      draggedData = null;
    }
  };
  
  return li;
}

let currentReadLaterItem = null;

function showReadLaterDetail(item) {
  const modal = $("readLaterDetailModal");
  const titleEl = $("readLaterDetailTitle");
  const linkEl = $("readLaterDetailLink");
  const saveBtn = $("saveReadLaterDetail");
  
  if (!modal || !titleEl || !linkEl || !saveBtn) return;
  
  currentReadLaterItem = item;
  titleEl.value = item.title || "Untitled";
  linkEl.textContent = item.url;
  linkEl.href = item.url;
  
  linkEl.onclick = (e) => {
    e.preventDefault();
    if (item.url) chrome.tabs.create({ url: item.url });
  };
  
  saveBtn.onclick = async () => {
    const newTitle = titleEl.value.trim() || "Untitled";
    const itemIndex = readLater.findIndex(x => x.id === item.id);
    if (itemIndex !== -1) {
      readLater[itemIndex].title = newTitle;
      await saveReadLater();
      renderReadLater();
      toast(t("toast_setting_saved", "설정 저장됨"));
      modal.hidden = true;
      modal.setAttribute("hidden", "");
      currentReadLaterItem = null;
    }
  };
  
  titleEl.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveBtn.click();
    }
  };
  
  modal.hidden = false;
  modal.removeAttribute("hidden");
  titleEl.focus();
  titleEl.select();
}

let pendingReadLaterInfo = null;

async function showReadLaterNameModal(info) {
  const modal = $("readLaterNameModal");
  const nameInput = $("readLaterNameModalInput");
  const saveBtn = $("saveReadLaterName");
  const cancelBtn = $("cancelReadLaterName");
  const closeBtn = $("closeReadLaterNameModal");
  
  pendingReadLaterInfo = info;
  nameInput.value = info.title || "";
  modal.hidden = false;
  nameInput.focus();
  nameInput.select();
  
  const save = async () => {
    const title = nameInput.value.trim() || info.title || "Untitled";
  const item = {
    id: uid(),
      title: title,
    url: info.url,
    createdAt: Date.now()
  };
  readLater.unshift(item);
  await saveReadLater();
  toast(t("toast_readlater_added", "나중에 다시 보기에 추가됨"));
  renderReadLater();
    modal.hidden = true;
    pendingReadLaterInfo = null;
  };
  
  const close = () => {
    modal.hidden = true;
    pendingReadLaterInfo = null;
  };
  
  saveBtn.onclick = save;
  cancelBtn.onclick = close;
  closeBtn.onclick = close;
  nameInput.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };
}

// addReadLaterBtn 핸들러는 위에서 이미 정의됨 (입력 폼 표시/숨김)

/* ------------------------------ Tools ------------------------------ */
const currentUrlEl = $("currentUrl");
const cleanUrlBtn = $("cleanUrlBtn");
const removeAdsBtn = $("removeAds");
const adBlockerStatusEl = $("adBlockerStatus");
const shortenUrlBtn = $("shortenUrl");

// URL 입력 필드 readonly 제거
currentUrlEl.removeAttribute("readonly");

// URL 정리하기 버튼
cleanUrlBtn.onclick = () => {
  const url = currentUrlEl.value.trim();
  if (!url) {
    toast(t("toast_copy_restricted", "URL을 입력하세요."));
    return;
  }
  try {
    currentUrlEl.value = cleanUrl(url);
    toast(t("toast_clean_copied", "정리된 URL"));
  } catch (e) {
    toast(t("toast_copy_failed", "URL 정리 실패"));
  }
};

// 단축 URL 버튼
shortenUrlBtn.onclick = async () => {
  const url = currentUrlEl.value.trim();
  if (!url) {
    toast(t("toast_copy_restricted", "URL을 입력하세요."));
    return;
  }
  
  try {
    // URL 유효성 검사
    new URL(url);
    // tinyurl.com API 사용 (무료, API 키 불필요)
    const response = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
    if (!response.ok) throw new Error("API failed");
    const shortUrl = await response.text();
    
    if (shortUrl && shortUrl.startsWith("http")) {
      currentUrlEl.value = shortUrl;
      await navigator.clipboard.writeText(shortUrl);
      toast(t("toast_short_url_copied", "단축 URL 복사됨: ") + shortUrl.slice(0, 30) + "...");
    } else {
      throw new Error("Invalid response");
    }
  } catch (e) {
    toast(t("toast_short_url_failed", "단축 URL 생성 실패"));
  }
};

// 광고 제거 토글 버튼
async function updateAdBlockerStatus() {
  const { globalAdsRemoved } = await storageGet(["globalAdsRemoved"]);
  const isActive = globalAdsRemoved !== false; // 기본값은 true
  removeAdsBtn.textContent = isActive 
    ? t("ad_blocker_active", "전역 광고 제거 활성화중")
    : t("ad_blocker_inactive", "전역 광고 제거 비활성화중");
  removeAdsBtn.classList.toggle("primary", isActive);
  adBlockerStatusEl.textContent = isActive
    ? t("ad_blocker_active", "전역 광고 제거 활성화중")
    : t("ad_blocker_inactive", "전역 광고 제거 비활성화중");
}

removeAdsBtn.onclick = async () => {
  const { globalAdsRemoved } = await storageGet(["globalAdsRemoved"]);
  const newState = globalAdsRemoved === false ? true : false; // 토글
  await storageSet({ globalAdsRemoved: newState });
  
  // 모든 탭에 적용
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.url && !isRestrictedUrl(tab.url)) {
        chrome.tabs.sendMessage(tab.id, { type: "REMOVE_ADS", enabled: newState }, (response) => {
          // 에러 무시
        });
      }
    });
  });
  
  await updateAdBlockerStatus();
  toast(newState 
    ? t("ad_blocker_active", "전역 광고 제거 활성화중")
    : t("ad_blocker_inactive", "전역 광고 제거 비활성화중"));
};

// renderCurrentUrl 제거 - 사용자가 직접 URL 입력

/* ------------------------------ Pomodoro ------------------------------ */
const timerTimeEl = $("timerTime");
const timerSubEl = $("timerSub");
const timerStartPauseBtn = $("timerStartPause");
const timerResetBtn = $("timerReset");
const timerHoursEl = $("timerHours");
const timerMinutesEl = $("timerMinutes");
const timerSecondsEl = $("timerSeconds");

let timerId = null;
let timerLeft = 25 * 60;
let timerRunning = false;

function renderTimer() {
  timerTimeEl.textContent = formatTime(timerLeft);
  timerSubEl.textContent = timerRunning ? t("status_focus", "집중 중…") : t("status_ready", "준비됨");
  timerStartPauseBtn.textContent = timerRunning ? t("pause", "일시정지") : t("start", "시작");
  
  // 입력 필드도 현재 타이머 값과 동기화 (타이머가 실행 중이 아닐 때만)
  if (!timerRunning && timerHoursEl && timerMinutesEl && timerSecondsEl) {
    const h = Math.floor(timerLeft / 3600);
    const m = Math.floor((timerLeft % 3600) / 60);
    const s = timerLeft % 60;
    timerHoursEl.value = h;
    timerMinutesEl.value = m;
    timerSecondsEl.value = s;
  }
}

function stopTimer() {
  timerRunning = false;
  clearInterval(timerId);
  timerId = null;
  renderTimer();
}

function startTimer() {
  if (timerRunning) return;
  timerRunning = true;
  renderTimer();
  clearInterval(timerId);
  timerId = setInterval(() => {
    timerLeft--;
    if (timerLeft <= 0) {
      timerLeft = 0;
      stopTimer();
      // 알림 표시
      chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL("icon.png"),
        title: t("pomodoro", "타이머"),
        message: t("pomodoro_time_up", "설정된 시간이 끝났습니다")
      }, (notificationId) => {
        if (chrome.runtime.lastError) {
          // 아이콘이 없어도 알림은 표시되도록 에러 무시
          console.log("Notification error:", chrome.runtime.lastError);
        }
      });
      toast(t("pomodoro_time_up", "설정된 시간이 끝났습니다"));
      return;
    }
    renderTimer();
  }, 1000);
}

timerStartPauseBtn.onclick = () => {
  if (timerRunning) stopTimer();
  else startTimer();
};

timerResetBtn.onclick = () => {
  stopTimer();
  timerLeft = 25 * 60;
  // 입력 필드도 초기화
  timerHoursEl.value = 0;
  timerMinutesEl.value = 25;
  timerSecondsEl.value = 0;
  renderTimer();
};

// 시간 업데이트 함수
function updateTimerFromInputs() {
  const hours = parseInt(timerHoursEl.value) || 0;
  const minutes = parseInt(timerMinutesEl.value) || 0;
  const seconds = parseInt(timerSecondsEl.value) || 0;
  
  // 유효성 검사
  if (hours < 0 || hours > 23) return;
  if (minutes < 0 || minutes > 59) return;
  if (seconds < 0 || seconds > 59) return;
  
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  if (totalSeconds <= 0) return;
  
  if (timerRunning) {
    stopTimer();
  }
  timerLeft = totalSeconds;
  renderTimer();
}

// 입력 필드 변경 시 실시간 업데이트
timerHoursEl.onchange = updateTimerFromInputs;
timerMinutesEl.onchange = updateTimerFromInputs;
timerSecondsEl.onchange = updateTimerFromInputs;

/* ------------------------------ Search ------------------------------ */
const globalSearchEl = $("globalSearch");
const searchResultsEl = $("searchResults");

function renderSearchResults(qRaw) {
  const q = (qRaw || "").trim().toLowerCase();
  if (!q) {
    if (currentView === "search") setView("notes");
    return;
  }

  const results = [];

  pages.forEach((p) => {
    const hit = (p.title || "").toLowerCase().includes(q) || (p.content || "").toLowerCase().includes(q);
    if (hit) results.push({ type: "note", title: p.title || "Untitled", sub: t("nav_notes", "노트"), ref: p.id });
  });

  tasks.forEach((t) => {
    if ((t.text || "").toLowerCase().includes(q)) results.push({ type: "task", title: t.text, sub: t("nav_tasks", "할 일"), ref: t.id });
  });

  highlights.forEach((h) => {
    const hit = (h.text || "").toLowerCase().includes(q) || (h.note || "").toLowerCase().includes(q);
    if (hit) results.push({ type: "highlight", title: (h.text || "").slice(0, 80), sub: t("nav_highlights", "하이라이트"), ref: h.createdAt });
  });

  readLater.forEach((r) => {
    const hit = (r.title || "").toLowerCase().includes(q) || (r.url || "").toLowerCase().includes(q);
    if (hit) results.push({ type: "readlater", title: r.title || r.url, sub: t("nav_readlater", "나중에 다시 보기"), ref: r.id });
  });

  setView("search");
  searchResultsEl.innerHTML = "";
  results.slice(0, 50).forEach((r) => {
    const li = document.createElement("li");
    li.className = "list-item";
    const left = document.createElement("div");
    left.style.minWidth = "0";
    const titleEl = document.createElement("div");
    titleEl.className = "item-title";
    titleEl.textContent = r.title;
    const s = document.createElement("div");
    s.className = "item-sub";
    s.textContent = r.sub;
    left.appendChild(titleEl);
    left.appendChild(s);
    li.appendChild(left);

    li.onclick = async () => {
      if (r.type === "note") {
        activePageId = r.ref;
        await storageSet({ activePageId });
        setView("notes");
        renderNotes();
      } else if (r.type === "task") {
        setView("tasks");
        renderTasks(qRaw);
      } else if (r.type === "highlight") {
        setView("highlights");
        highlightSearchEl.value = qRaw;
        renderHighlights(qRaw);
      } else if (r.type === "readlater") {
        setView("readlater");
        renderReadLater();
      }
    };
    searchResultsEl.appendChild(li);
  });
}

globalSearchEl.addEventListener("input", () => {
  const q = globalSearchEl.value;
  // 현재 뷰 렌더링에도 반영
  if (currentView === "notes") {
    // 페이지 검색 입력에도 반영
    if (pageSearchInput) {
      pageSearchInput.value = q;
    }
    renderNotes();
  }
  if (currentView === "tasks") renderTasks(q);
  if (currentView === "highlights") renderHighlights(highlightSearchEl.value);
  renderSearchResults(q);
});

/* ------------------------------ Render / Init ------------------------------ */
async function renderAll() {
  if (currentView === "notes") renderNotes();
  if (currentView === "tasks") renderTasks(globalSearchEl.value);
  if (currentView === "highlights") renderHighlights(highlightSearchEl.value);
  if (currentView === "readlater") renderReadLater();
  if (currentView === "settings") await renderSettings();
  if (currentView === "tools") updateAdBlockerStatus();
  renderTimer();
}

/* ------------------------------ Settings ------------------------------ */
const shortcutInput = $("shortcutInput");
const recordShortcutBtn = $("recordShortcut");
const shortcutStatus = $("shortcutStatus");

let isRecordingShortcut = false;
let recordedKeys = [];

async function initSettings() {
  const { customShortcut } = await storageGet(["customShortcut"]);
  
  if (customShortcut) {
    const keys = customShortcut.split("+");
    shortcutInput.value = formatShortcut(keys);
  } else {
    shortcutInput.value = "Ctrl+Shift+C (기본)";
  }
  
  // 이미 별도 창으로 열려있는지 확인 (URL에 쿼리 파라미터 추가)
  const urlParams = new URLSearchParams(window.location.search);
  const isWindowMode = urlParams.get("window") === "true";
  const isReadLaterMode = urlParams.get("readlater") === "true";
  
  // Read Later 모달을 띄워야 하는 경우
  if (isReadLaterMode) {
    // background.js에서 메시지를 기다림
    setTimeout(() => {
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === "SHOW_READLATER_MODAL" && msg.info) {
          showReadLaterNameModal(msg.info);
          setView("readlater");
          sendResponse({ ok: true });
          return true;
        }
      });
    }, 100);
  }
  
  // 항상 별도 창으로 열기 (기본 동작)
  if (!isWindowMode) {
    // 약간의 지연 후 별도 창으로 열기 (초기화 완료 대기)
    setTimeout(() => {
      chrome.windows.create({
        url: chrome.runtime.getURL("popup.html?window=true"),
        type: "normal",
        width: 1200,
        height: 700,
        focused: true
      }, (win) => {
        // 새 창이 열리면 현재 팝업 닫기
        if (win && !chrome.runtime.lastError) {
          setTimeout(() => {
            window.close();
          }, 200);
        } else if (chrome.runtime.lastError) {
          console.error("Failed to open window:", chrome.runtime.lastError);
        }
      });
    }, 300);
  }
}

// 별도 창으로 열기 기능은 항상 활성화됨 (토글 제거)

function formatShortcut(keys) {
  return keys.map(k => {
    if (k === "Ctrl") return navigator.platform.includes("Mac") ? "⌘" : "Ctrl";
    if (k === "Alt") return navigator.platform.includes("Mac") ? "⌥" : "Alt";
    if (k === "Shift") return "Shift";
    return k.toUpperCase();
  }).join("+");
}

function parseShortcut(str) {
  return str.split("+").map(s => s.trim());
}

recordShortcutBtn.onclick = () => {
  if (isRecordingShortcut) {
    isRecordingShortcut = false;
    recordedKeys = [];
    recordShortcutBtn.textContent = t("record_shortcut", "단축키 기록");
    shortcutStatus.hidden = true;
    return;
  }
  
  isRecordingShortcut = true;
  recordedKeys = [];
  recordShortcutBtn.textContent = t("stop_recording", "기록 중지");
  shortcutStatus.textContent = t("shortcut_recording", "키 조합을 누르세요...");
  shortcutStatus.hidden = false;
  shortcutInput.value = "";
  shortcutInput.focus();
};

shortcutInput.addEventListener("click", () => {
  if (!isRecordingShortcut) {
    recordShortcutBtn.click();
  }
});

shortcutInput.addEventListener("keydown", async (e) => {
  if (!isRecordingShortcut) {
    return;
  }
  
  e.preventDefault();
  e.stopPropagation();
  
  const keys = [];
  if (e.ctrlKey || e.metaKey) keys.push(navigator.platform.includes("Mac") ? "Command" : "Ctrl");
  if (e.altKey) keys.push("Alt");
  if (e.shiftKey) keys.push("Shift");
  
  if (e.key && e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
    keys.push(e.key.toUpperCase());
  } else if (e.key && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Space", "Tab"].includes(e.key)) {
    keys.push(e.key);
  }
  
  if (keys.length >= 2) {
    recordedKeys = keys;
    shortcutInput.value = formatShortcut(keys);
    isRecordingShortcut = false;
    recordShortcutBtn.textContent = t("record_shortcut", "단축키 기록");
    
    // 단축키 저장
    const shortcutStr = keys.join("+");
    await storageSet({ customShortcut: shortcutStr });
    
    shortcutStatus.textContent = t("shortcut_saved", "단축키 저장됨: chrome://extensions/shortcuts 에서 설정하세요");
    toast(t("toast_shortcut_saved", "단축키 저장됨. chrome://extensions/shortcuts 에서 설정하세요"));
    
    // chrome://extensions/shortcuts 페이지 열기
    setTimeout(() => {
      chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
    }, 500);
  } else if (keys.length > 0) {
    shortcutStatus.textContent = t("shortcut_needs_modifier", "수정 키(Ctrl/Alt/Shift)와 함께 눌러주세요");
  }
});

async function renderSettings() {
  // 저장 공간 사용량 계산 및 표시
  await updateStorageUsage();
}

async function updateStorageUsage() {
  try {
    // 모든 저장된 데이터 가져오기
    const allData = await chrome.storage.local.get(null);
    
    // JSON 문자열로 변환하여 크기 계산
    const jsonString = JSON.stringify(allData);
    const usedBytes = new Blob([jsonString]).size;
    const usedMB = usedBytes / (1024 * 1024);
    const maxMB = 10; // Chrome Extension storage.local 최대 10MB
    const usedPercent = (usedMB / maxMB) * 100;
    
    const storageUsageInfo = $("storageUsageInfo");
    const storageUsageBar = $("storageUsageBar");
    
    if (storageUsageInfo && storageUsageBar) {
      const remainingMB = (maxMB - usedMB).toFixed(2);
      storageUsageInfo.textContent = `${usedMB.toFixed(2)} MB / ${maxMB} MB ${t("status_saving", "사용 중")} (${remainingMB} MB ${t("status_ready", "남음")})`;
      storageUsageBar.style.width = `${Math.min(100, usedPercent)}%`;
      
      // 색상 변경 (80% 이상이면 경고)
      if (usedPercent >= 80) {
        storageUsageBar.style.background = "var(--error, #dc3545)";
      } else if (usedPercent >= 60) {
        storageUsageBar.style.background = "var(--warning, #ffc107)";
      } else {
        storageUsageBar.style.background = "var(--accent, #007bff)";
      }
    }
  } catch (e) {
    console.error("Storage usage calculation failed:", e);
  }
}

// 저장소 변경 감지
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local") {
    // 하이라이트가 변경되면 자동으로 리스트 새로고침
    if (changes.highlights) {
      loadHighlights().then(() => {
        if (currentView === "highlights") {
          renderHighlights(highlightSearchEl?.value || "");
        }
      });
    }
    // 나중에 보기가 변경되면 자동으로 리스트 새로고침
    if (changes.readLater) {
      loadReadLater().then(() => {
        if (currentView === "readlater") {
          renderReadLater();
        }
      });
    }
    // 저장 공간 사용량 업데이트
    if (currentView === "settings") {
      updateStorageUsage();
    }
  }
});

async function init() {
  await initTheme();
  await initLang();
  await initSettings();
  await loadNotes();
  await loadTasks();
  await loadHighlights();
  await loadReadLater();
  
  // 모달 초기화 - 확실히 닫기
  if (highlightDetailModal) {
    highlightDetailModal.hidden = true;
    highlightDetailModal.setAttribute("hidden", "");
  }
  
  setView("notes");
  renderAll();
  await updateAdBlockerStatus();
  
  // background.js에서 보낸 메시지 처리 (전역 리스너)
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "SHOW_READLATER_MODAL") {
      // 이름 입력 모달 표시
      if (msg.info) {
        setTimeout(() => {
          showReadLaterNameModal(msg.info);
          setView("readlater");
        }, 300);
      }
      sendResponse({ ok: true });
      return true;
    }
    
    if (msg.type === "READLATER_ADDED") {
      // Read Later가 추가되었을 때 목록 새로고침
      loadReadLater().then(() => {
        if (currentView === "readlater") {
          renderReadLater();
        }
      });
      sendResponse({ ok: true });
      return true;
    }
  });
}

init();
