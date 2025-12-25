let dict = {};

export async function loadLang(lang) {
  try {
    const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
    const res = await fetch(url);
    const messages = await res.json();
    
    // Convert Chrome i18n format to simple key-value dict
    dict = {};
    Object.keys(messages).forEach(key => {
      dict[key] = messages[key].message;
    });

    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

    apply();
  } catch (e) {
    console.error("i18n load failed:", lang, e);
  }
}

function apply() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    const text = dict[key] || el.textContent || key;
    el.textContent = text;
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    el.placeholder = dict[el.dataset.i18nPlaceholder] || "";
  });
}
