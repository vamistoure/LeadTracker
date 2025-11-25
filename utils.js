(() => {
  const deriveCompanyFromHeadline = (headline = '') => {
    if (!headline || typeof headline !== 'string') return '';
    const text = headline.trim();
    if (!text) return '';
    const patterns = [
      /@\s*([^|–—\-•·,;]+?)(\s*[|–—\-•·,;]|$)/i,
      /\bchez\s+([^|–—\-•·,;]+?)(\s*[|–—\-•·,;]|$)/i,
      /\bat\s+([^|–—\-•·,;]+?)(\s*[|–—\-•·,;]|$)/i
    ];
    for (const reg of patterns) {
      const match = text.match(reg);
      if (match && match[1]) return match[1].trim();
    }
    if (text.includes('@')) {
      const candidate = text.split('@')[1]?.split(/[|–—\-•·,;]/)[0];
      if (candidate) return candidate.trim();
    }
    return '';
  };

  const formatTitle = (label = '') => (label || '').trim().toUpperCase();
  const normalizeTitle = (label = '') => formatTitle(label);

  const storageGet = (keys) =>
    new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get(keys, (result) => {
          const err = chrome.runtime?.lastError;
          if (err) return reject(err);
          resolve(result || {});
        });
      } catch (e) {
        reject(e);
      }
    });

  const storageSet = (obj) =>
    new Promise((resolve, reject) => {
      try {
        chrome.storage.local.set(obj, () => {
          const err = chrome.runtime?.lastError;
          if (err) return reject(err);
          resolve();
        });
      } catch (e) {
        reject(e);
      }
    });

  if (typeof window !== 'undefined') {
    window.deriveCompanyFromHeadline = deriveCompanyFromHeadline;
    window.formatTitle = formatTitle;
    window.normalizeTitle = normalizeTitle;
    window.storageGet = storageGet;
    window.storageSet = storageSet;
  }
})();
