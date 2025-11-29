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

  const simplifyTitle = (label = '') => {
    if (!label || typeof label !== 'string') return '';
    let t = label.trim().toUpperCase();

    // Connecteurs fréquents
    t = t.replace(/[+]/g, ' AND ');
    t = t.replace(/&/g, ' AND ');
    t = t.replace(/\//g, ' ');

    // Simplifications de domaines Data/Analytics/BI/AI/ML
    t = t.replace(/\bDATA\s+AND\s+ANALYTICS\b/g, 'DATA');
    t = t.replace(/\bDATA\s*&\s*ANALYTICS\b/g, 'DATA');
    t = t.replace(/\bANALYTICS\s+AND\s+DATA\b/g, 'DATA');
    t = t.replace(/\bDATA\s+AND\s+INSIGHTS\b/g, 'DATA');
    t = t.replace(/\bANALYTICS\s+AND\s+INSIGHTS\b/g, 'ANALYTICS');
    t = t.replace(/\bBUSINESS\s+INTELLIGENCE\b/g, 'BI');
    t = t.replace(/\bMACHINE\s+LEARNING\b/g, 'ML');
    t = t.replace(/\bARTIFICIAL\s+INTELLIGENCE\b/g, 'AI');
    t = t.replace(/\bBIG\s+DATA\b/g, 'DATA');

    // Rôles / synonymes courants
    t = t.replace(/\bVICE PRESIDENT\b/g, 'VP');
    t = t.replace(/\bVICE-PRESIDENT\b/g, 'VP');
    t = t.replace(/\bRESPONSABLE\b/g, 'MANAGER');
    t = t.replace(/\bDIRECTEUR\b/g, 'DIRECTOR');
    t = t.replace(/\bDIRECTRICE\b/g, 'DIRECTOR');
    t = t.replace(/\bHEAD OF\b/g, 'HEAD');
    t = t.replace(/\bLEADER\b/g, 'LEAD');
    t = t.replace(/\bMANAGING DIRECTOR\b/g, 'MD');
    t = t.replace(/\bSENIOR\b/g, 'SR');

    // Mots de liaison à supprimer
    t = t.replace(/\b(OF|DE|DU|DES|LA|LE|LES|L’|L'|THE)\b/g, ' ');
    t = t.replace(/\b(AND|ET|WITH|IN|EN)\b/g, ' ');

    // Nettoyage espaces multiples
    t = t.replace(/\s+/g, ' ').trim();

    // Déduplication simple des tokens (préserve l'ordre)
    const tokens = t.split(' ').filter(Boolean);
    const seen = new Set();
    const deduped = tokens.filter((tok) => {
      if (seen.has(tok)) return false;
      seen.add(tok);
      return true;
    });

    return deduped.join(' ');
  };

  const parseEmployeeRange = (raw = '') => {
    if (!raw || typeof raw !== 'string') return null;
    const text = raw.replace(/\u202f/g, ' ').replace(/\u00a0/g, ' ').trim();
    if (!text) return null;

    const parseNum = (token) => {
      if (!token) return null;
      const m = token.trim().match(/([\d.,]+)\s*([kKmM]?)/);
      if (!m) return null;
      const base = parseFloat(m[1].replace(/,/g, ''));
      if (!Number.isFinite(base)) return null;
      const suffix = (m[2] || '').toLowerCase();
      if (suffix === 'k') return Math.round(base * 1000);
      if (suffix === 'm') return Math.round(base * 1000000);
      return Math.round(base);
    };

    const plusMatch = text.match(/([\d.,]+\s*[kKmM]?)\s*\+\s*(employ|employe|employee)/i);
    if (plusMatch) {
      const min = parseNum(plusMatch[1]);
      if (Number.isFinite(min)) return { min, max: null, raw: text };
    }

    const rangeMatch = text.match(/([\d.,]+\s*[kKmM]?)\s*[-–—]\s*([\d.,]+\s*[kKmM]?)/);
    if (rangeMatch) {
      const min = parseNum(rangeMatch[1]);
      const max = parseNum(rangeMatch[2]);
      if (Number.isFinite(min) && Number.isFinite(max)) return { min, max, raw: text };
    }

    const single = parseNum(text);
    if (Number.isFinite(single)) return { min: single, max: single, raw: text };
    return null;
  };

  const computeCompanySegment = (range) => {
    if (!range || (!range.min && !range.max)) return null;
    const min = range.min || 0;
    const max = range.max || min;
    const point = max || min;
    if (point <= 10) return 'Startup';
    if (point <= 50) return 'Scale-up';
    if (point <= 250) return 'PME';
    if (point <= 1000) return 'ETI';
    return 'Grand groupe';
  };

  const formatTitle = (label = '') => simplifyTitle(label);
  const normalizeTitle = (label = '') => simplifyTitle(label);

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

  // Fonction utilitaire pour vérifier si Supabase est configuré et disponible
  const isSupabaseConfigured = async () => {
    try {
      const data = await storageGet(['supabaseAccessToken', 'supabaseUser']);
      // Supabase est configuré si on a un token d'accès OU si le mode local n'est pas activé explicitement
      // (si supabaseMode est 'local', alors Supabase n'est pas utilisé)
      const mode = await storageGet(['supabaseMode']);
      if (mode?.supabaseMode === 'local') {
        return false;
      }
      return !!(data?.supabaseAccessToken && typeof data.supabaseAccessToken === 'string');
    } catch (e) {
      console.warn('[LeadTracker] Erreur vérification Supabase:', e);
      return false;
    }
  };

  if (typeof window !== 'undefined') {
    window.deriveCompanyFromHeadline = deriveCompanyFromHeadline;
    window.formatTitle = formatTitle;
    window.normalizeTitle = normalizeTitle;
    window.simplifyTitle = simplifyTitle;
    window.parseEmployeeRange = parseEmployeeRange;
    window.computeCompanySegment = computeCompanySegment;
    window.storageGet = storageGet;
    window.storageSet = storageSet;
    window.isSupabaseConfigured = isSupabaseConfigured;
  }
})();
