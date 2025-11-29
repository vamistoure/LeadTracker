/**
 * Content Script - LinkedIn Lead Tracker
 * IMPORTANT: Pas de scraping automatique - uniquement lecture manuelle déclenchée par l'utilisateur
 * Manifest V3: réponse synchrone immédiate
 */

console.log('[LeadTracker] Content script chargé');

// Rate limiting: empêcher trop d'appels rapides (protection anti-bannissement)
let lastCallTime = 0;
const MIN_CALL_INTERVAL_MS = 500; // Minimum 500ms entre deux appels
const MAX_HEADLINE_RETRIES = 3;
const HEADLINE_RETRY_DELAY_MS = 250;
const DEBUG_HEADLINE = false; // Passe à true pour tracer les sélecteurs/headlines lors du debug
const AUTO_CAPTURE_DELAY_MS = 800;
let lastAutoCapturePath = null;
let autoCaptureInFlight = false;
let lastNetworkScanPath = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_PAGE_CONTEXT') {
    // Rate limiting: vérifier qu'on ne fait pas trop d'appels
    const now = Date.now();
    if (now - lastCallTime < MIN_CALL_INTERVAL_MS) {
      console.warn('[LeadTracker] Appel trop rapide, rate limiting activé');
      sendResponse({ contextType: 'other', error: 'rate_limited' });
      return false;
    }
    try {
      handleGetPageContext(sendResponse);
    } catch (error) {
      console.error('[LeadTracker] Erreur analyse contexte:', error);
      sendResponse({ contextType: 'other', error: error.message });
    }
    return true;
  }
  if (request.type === 'SCAN_SEARCH_PAGE') {
    handleScanSearchPage(sendResponse);
    return true;
  }
  return false;
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fonction pour vérifier si Supabase est configuré
async function isSupabaseConfigured() {
  try {
    const data = await chrome.storage.local.get(['supabaseAccessToken', 'supabaseMode']);
    // Si le mode local est activé, Supabase n'est pas utilisé
    if (data?.supabaseMode === 'local') {
      return false;
    }
    return !!(data?.supabaseAccessToken && typeof data.supabaseAccessToken === 'string');
  } catch (e) {
    return false;
  }
}

async function pushLeadsToSupabase(leads) {
  try {
    if (!leads || !leads.length) {
      console.log('[LeadTracker] pushLeadsToSupabase: Aucun lead à synchroniser');
      return;
    }
    
    console.log('[LeadTracker] 🔄 Tentative synchronisation:', {
      leadCount: leads.length,
      timestamp: new Date().toISOString()
    });
    
    // Vérifier si Supabase est configuré avant d'envoyer
    const isConfigured = await isSupabaseConfigured();
    if (!isConfigured) {
      console.log('[LeadTracker] ⏭️ Mode local ou Supabase non configuré - synchronisation ignorée');
      return;
    }
    
    console.log('[LeadTracker] ✅ Supabase configuré, envoi des leads au background...');
    
    chrome.runtime.sendMessage({ type: 'PUSH_SUPABASE', leads }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[LeadTracker] ❌ Erreur envoi message Supabase:', chrome.runtime.lastError.message);
      } else if (response) {
        if (response.ok) {
          console.log('[LeadTracker] ✅ Synchronisation réussie (réponse du background)');
        } else {
          console.error('[LeadTracker] ❌ Synchronisation échouée:', response.error);
        }
      }
    });
  } catch (e) {
    console.error('[LeadTracker] ❌ Exception pushLeadsToSupabase:', {
      error: e,
      message: e?.message,
      stack: e?.stack
    });
  }
}

function parseEmployeeRange(raw = '') {
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
}

function computeCompanySegment(range) {
  if (!range || (!range.min && !range.max)) return null;
  const min = range.min || 0;
  const max = range.max || min;
  const point = max || min;
  if (point <= 10) return 'Startup';
  if (point <= 50) return 'Scale-up';
  if (point <= 250) return 'PME';
  if (point <= 1000) return 'ETI';
  return 'Grand groupe';
}

function simplifyTitle(label = '') {
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
}

function normalizeTitle(label = '') {
  return simplifyTitle(label);
}

async function handleGetPageContext(sendResponse) {
  try {
    let context = analyzePageContextOnce();
    if (context.contextType === 'profile' && !context.profileHeadline) {
      for (let attempt = 0; attempt < MAX_HEADLINE_RETRIES; attempt++) {
        await sleep(HEADLINE_RETRY_DELAY_MS);
        context = analyzePageContextOnce();
        if (context.profileHeadline) break;
      }
    }
    console.log('[LeadTracker] Contexte détecté:', context);
    if (context.contextType === 'profile') {
      checkLeadForUpdates(context);
    }
    lastCallTime = Date.now();
    sendResponse(context);
  } catch (error) {
    console.error('[LeadTracker] Erreur analyse contexte:', error);
    sendResponse({ contextType: 'other', error: error.message });
  }
}

/**
 * Analyse l'URL et le DOM pour déterminer le contexte
 *
 * SÉCURITÉ ANTI-BANNISSEMENT:
 * - Lecture unique du DOM (pas de boucle)
 * - Pas de navigation automatique
 * - Pas de requêtes réseau
 * - Uniquement lecture des éléments visibles sur la page actuelle
 * - Déclenché UNIQUEMENT par action manuelle de l'utilisateur (clic sur l'icône)
 */
function analyzePageContextOnce() {
  const url = window.location.href;

  // --- CONTEXTE : RECHERCHE (résultats ou rubrique People d'entreprise) ---
  if (
    url.includes('/search/results/people/') ||
    (url.includes('/company/') && url.includes('/people'))
  ) {
    let keyword = '';

    if (url.includes('/search/results/people/')) {
      // Tentative 1: URL param
      try {
        const urlObj = new URL(url);
        keyword = urlObj.searchParams.get('keywords');
      } catch (e) {}

      // Tentative 2: Input du DOM (Sélecteur générique LinkedIn, peut varier)
      if (!keyword) {
        const searchInput = document.querySelector('input.search-global-typeahead__input');
        if (searchInput) keyword = searchInput.value;
      }
    } else {
      // Page People d'entreprise
      const companyTitleSelectors = [
        '.org-top-card-summary__title',
        '.org-top-card-module__title',
        '.org-top-card-primary-content__title',
        '[data-anonymize="company-name"]',
        'h1'
      ];
      for (const selector of companyTitleSelectors) {
        const el = document.querySelector(selector);
        if (el && el.innerText?.trim()) {
          keyword = el.innerText.trim();
          break;
        }
      }
      if (!keyword) {
        const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
        keyword = ogTitle.split('|')[0]?.trim() || ogTitle;
      }
      if (!keyword) {
        // fallback slug
        try {
          const urlObj = new URL(url);
          const parts = urlObj.pathname.split('/');
          const idx = parts.indexOf('company');
          if (idx !== -1 && parts[idx + 1]) {
            keyword = decodeURIComponent(parts[idx + 1]).replace(/-/g, ' ');
          }
        } catch (e) {}
      }
    }

    // Nettoyage
    if (keyword) keyword = decodeURIComponent(keyword).trim();

    return {
      contextType: 'search',
      searchKeyword: keyword || '',
      profileName: null,
      profileHeadline: null,
      profileUrl: null
    };
  }

  // --- CONTEXTE : PROFIL ---
  if (url.includes('/in/')) {
    // IMPORTANT: Lecture unique du DOM - pas de scraping intensif
    // On lit uniquement les éléments déjà chargés sur la page actuelle
    // Sélecteurs "Best effort" pour LinkedIn (la structure change souvent)

    // Lecture unique du texte - pas de manipulation du DOM
    let profileName = readProfileName();
    const profileHeadline = readProfileHeadline();
    const profileCompany = readProfileCompany();

    // Si toujours pas de nom, essayer depuis l'URL (dernier recours)
    if (!profileName) {
      try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        const profileSlug = pathParts[pathParts.indexOf('in') + 1];
        if (profileSlug) {
          // Décoder l'URL et formater (ex: "john-doe" -> "John Doe")
          profileName = decodeURIComponent(profileSlug)
            .split('-')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        }
      } catch (e) {}
    }

    // Nettoyage de l'URL pour enlever les IDs de session inutiles
    // On garde https://www.linkedin.com/in/identifiant/
    let cleanUrl = url;
    try {
      const urlObj = new URL(url);
      cleanUrl = urlObj.origin + urlObj.pathname;
    } catch (e) {}

    return {
      contextType: 'profile',
      searchKeyword: null,
      profileName: profileName,
      profileHeadline: profileHeadline,
      profileCompany: profileCompany,
      profileUrl: cleanUrl
    };
  }

  // --- CONTEXTE : AUTRE ---
  return { contextType: 'other' };
}

async function handleScanSearchPage(sendResponse) {
  try {
    const url = window.location.href;
    const isSearchPeople = url.includes('/search/results/people');
    const isCompanyPeople = url.includes('/company/') && url.includes('/people');
    if (!isSearchPeople && !isCompanyPeople) {
      sendResponse({ ok: false, error: 'not_search_page' });
      return;
    }
    const companyInfo = isCompanyPeople
      ? readCompanyInfoFromPage()
      : { sizeText: '', industryText: '' };
    const companySizeText = companyInfo.sizeText || '';
    const companyRange = companySizeText ? parseEmployeeRange(companySizeText) : null;
    const companySegment = companyRange ? computeCompanySegment(companyRange) : null;
    const companyNameFromPage = isCompanyPeople ? readCompanyNameFromCompanyPage() : '';
    const companyIndustry = isCompanyPeople ? companyInfo.industryText || '' : '';

    let { leads = [], searchTitles = [] } = await chrome.storage.local.get(['leads', 'searchTitles']);
    if (!searchTitles.length) {
      sendResponse({ ok: false, error: 'no_titles' });
      return;
    }

    const canonicalByNorm = new Map();
    searchTitles.forEach((t) => {
      const norm = simplifyTitle(t.label || '');
      if (!norm) return;
      if (norm.length < 3) return; // éviter les matchs sur 2 lettres (ex: PO dans un nom)
      if (!canonicalByNorm.has(norm)) {
        // Stocker le label original lisible au lieu de la version normalisée
        // pour être cohérent avec autoCaptureProfileIfMatch qui utilise t.label
        canonicalByNorm.set(norm, t.label);
      }
    });

    if (!canonicalByNorm.size) {
      sendResponse({ ok: false, error: 'no_titles' });
      return;
    }

    // Backfill pour tous les leads de la même entreprise (page People)
    const now = Date.now();
    if (isCompanyPeople) {
      const companyNameNorm = simplifyTitle(companyNameFromPage || '');
      if (companyNameNorm) {
        const updatedBackfill = [];
        leads = leads.map((l) => {
          const leadCompanyNorm = simplifyTitle(l.company || '');
          if (leadCompanyNorm === companyNameNorm) {
            const merged = {
              ...l,
              company: l.company || companyNameFromPage || '',
              employeeRange: l.employeeRange || (companyRange ? companyRange.raw || companySizeText : companySizeText || ''),
              companySegment:
                l.companySegment ||
                companySegment ||
                computeCompanySegment(parseEmployeeRange(l.employeeRange || '') || null) ||
                '',
              companyIndustry: l.companyIndustry || companyIndustry || '',
              updatedAt: now
            };
            updatedBackfill.push(merged.id);
            return merged;
          }
          return l;
        });
        if (updatedBackfill.length) {
          await chrome.storage.local.set({ leads });
          // Synchroniser automatiquement avec Supabase
          const backfilledLeads = leads.filter(l => updatedBackfill.includes(l.id));
          if (backfilledLeads.length) {
            pushLeadsToSupabase(backfilledLeads);
          }
        }
      }
    }

    let cards = Array.from(
      document.querySelectorAll(
        '[data-chameleon-result-urn], .reusable-search__result-container, .entity-result, li[class*="reusable-search"], .org-people-profile-card__profile-info'
      )
    );

    // Fallback: si aucune carte détectée, tenter via les liens /in/ (company people est parfois simplifié)
    if (!cards.length) {
      const anchors = Array.from(document.querySelectorAll('a[href*="/in/"]'));
      const wrapped = anchors.map((a) => a.closest('li') || a.closest('div') || a);
      cards = wrapped.filter(Boolean);
    }

    const knownUrls = new Set((leads || []).map((l) => l.profileUrl));
    let duplicates = 0;
    let updatedExisting = 0;
    const added = [];
    const changedLeads = [];

    for (const card of cards) {
      const profile = extractProfileFromSearchCard(null, card);
      if (!profile || !profile.url) continue;
      const existingIndex = leads.findIndex((l) => l.profileUrl === profile.url);
      const existingLead = existingIndex !== -1 ? leads[existingIndex] : null;
      const isDuplicate = existingLead !== null;

      const headlineNorm = simplifyTitle(profile.headline || '');
      const nameNorm = simplifyTitle(profile.name || '');

      let matchedLabel = null;
      for (const [norm, label] of canonicalByNorm.entries()) {
        if (!norm) continue;
        const pattern = new RegExp(`\\b${norm.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`);
        if ((headlineNorm && pattern.test(headlineNorm)) || (nameNorm && pattern.test(nameNorm))) {
          matchedLabel = label;
          break;
        }
      }
      if (!matchedLabel) continue;

      const rangeValue = companyRange ? companyRange.raw || companySizeText : companySizeText || '';
      const leadUpdate = {
        name: profile.name || existingLead?.name || 'Inconnu',
        headline: profile.headline || existingLead?.headline || '',
        company: companyNameFromPage || existingLead?.company || '',
        employeeRange: rangeValue || existingLead?.employeeRange || '',
        companySegment: companySegment || existingLead?.companySegment || '',
        companyIndustry: companyIndustry || existingLead?.companyIndustry || '',
        searchTitle: matchedLabel
      };

      if (isDuplicate) {
        duplicates++;
        leads[existingIndex] = {
          ...existingLead,
          ...leadUpdate,
          updatedAt: now
        };
        updatedExisting++;
        changedLeads.push(leads[existingIndex]);
      } else {
        knownUrls.add(profile.url);
        const newLead = {
          id: now + '_' + Math.random().toString(36).slice(2),
          profileUrl: profile.url,
          direction: 'outbound_pending',
          requestDate: null,
          acceptanceDate: null,
          contacted: false,
          contactedDate: null,
          topLead: false,
          createdAt: now,
          updatedAt: now,
          ...leadUpdate
        };
        added.push(newLead);
        changedLeads.push(newLead);
      }
    }

    let finalLeads = leads;
    if (added.length) {
      finalLeads = [...leads, ...added];
    }
    if (updatedExisting || added.length) {
      await chrome.storage.local.set({ leads: finalLeads });
      pushLeadsToSupabase(changedLeads);
    }

    sendResponse({
      ok: true,
      added: added.length,
      duplicates,
      updatedExisting,
      scanned: cards.length
    });
  } catch (error) {
    console.error('[LeadTracker] Scan search error:', error);
    sendResponse({ ok: false, error: 'exception', message: error?.message || 'unknown' });
  }
}

function debugLog(...args) {
  if (DEBUG_HEADLINE) {
    console.log(...args);
  }
}

async function checkLeadForUpdates(context) {
  try {
    if (!context || context.contextType !== 'profile' || !context.profileUrl) return;
    const { leads = [] } = await chrome.storage.local.get(['leads']);
    const lead = leads.find((l) => l.profileUrl === context.profileUrl);
    if (!lead) return;

    const newData = {};
    if (context.profileName && context.profileName !== lead.name) newData.name = context.profileName;
    if (context.profileHeadline && context.profileHeadline !== lead.headline)
      newData.headline = context.profileHeadline;
    if (context.profileCompany && context.profileCompany !== lead.company)
      newData.company = context.profileCompany;

    // Lire la dernière expérience pour détecter changement de poste/entreprise
    const latestExp = readLatestExperience();
    if (latestExp.title && latestExp.title !== lead.headline) {
      newData.headline = latestExp.title;
    }
    if (latestExp.company && latestExp.company !== lead.company) {
      newData.company = latestExp.company;
    }

    if (!Object.keys(newData).length) return;

    const suggestion = {
      leadId: lead.id,
      profileUrl: lead.profileUrl,
      newData,
      timestamp: Date.now()
    };
    await chrome.storage.local.set({ pendingUpdateSuggestion: suggestion });
    sendNotification('Mise à jour détectée', 'Des changements sont disponibles pour ce lead.');
  } catch (e) {
    console.warn('checkLeadForUpdates failed:', e);
  }
}

// Stratégie headline:
// 1) Sélecteurs DOM modernes LinkedIn (data-anonymize, top-card)
// 2) Métadonnées og:description / meta description
// 3) Document title en dernier recours
function readProfileHeadline() {
  const selectors = [
    '[data-anonymize="headline"]',
    '[data-generated-suggestion-target]',
    '.pv-text-details__left-panel .text-body-medium',
    '.pv-text-details__left-panel .text-body-small',
    '.pv-text-details__right-panel .text-body-medium',
    '.pv-text-details__right-panel .text-body-small',
    '.text-body-medium.break-words',
    '.text-body-medium',
    'div[class*="text-body-medium"]',
    'section.artdeco-card div.inline-show-more-text',
    'section.pv-top-card h2',
    'section.pv-top-card span.text-body-medium',
    'main h2[data-anonymize="headline"]',
    'main [data-anonymize="headline"]',
    'main h2',
    'main [dir="ltr"]'
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (DEBUG_HEADLINE)
      debugLog('[LeadTracker][DEBUG] Headline selector:', selector, el ? el.innerText : 'null');
    if (el && el.innerText?.trim()) {
      return el.innerText.trim();
    }
  }

  // Fallback métadonnées
  const metaHeadline = readHeadlineFromMeta();
  if (metaHeadline) {
    debugLog('[LeadTracker][DEBUG] Headline from meta:', metaHeadline);
    return metaHeadline;
  }

  debugLog('[LeadTracker][DEBUG] Headline toujours vide après sélecteurs et métas.');
  return '';
}

function readProfileCompany() {
  // 1) Dernière expérience (la plus récente) si visible
  const expSection =
    document.querySelector('section[id*="experience"]') ||
    document.querySelector('section.pv-profile-section__section-info');

  if (expSection) {
    const firstItem =
      expSection.querySelector('li.artdeco-list__item') ||
      expSection.querySelector('.pv-entity__position-group-role-item') ||
      expSection.querySelector('li');

    if (firstItem) {
      const companySelectors = [
        '.t-14.t-normal.t-black span',
        '.pv-entity__secondary-title',
        'a[href*="/company/"] span',
        'a[href*="/company/"]'
      ];

      for (const selector of companySelectors) {
        const companyEl = firstItem.querySelector(selector);
        if (companyEl && companyEl.innerText?.trim()) {
          return companyEl.innerText.trim();
        }
      }
    }
  }

  // 2) Extraction via headline (après @/at/chez/in/with/avec)
  const headline = readProfileHeadline() || '';
  if (headline) {
    const markers = ['@', ' at ', ' chez ', ' in ', ' with ', ' avec '];
    const lower = headline.toLowerCase();
    let idx = -1;
    let markerLen = 0;

    for (const m of markers) {
      const searchToken = m.trim() === '@' ? '@' : m;
      const i = lower.indexOf(searchToken);
      if (i !== -1 && (idx === -1 || i < idx)) {
        idx = i;
        markerLen = m.length;
      }
    }

    if (idx !== -1) {
      const rawCompany =
        markerLen === 1 ? headline.substring(idx + 1) : headline.substring(idx + markerLen);

      const company = rawCompany
        .split(/[\|\-–,·]/)[0]
        .replace(/^\s*(de|du|des|la|le|l’|l'|the)\s+/i, '')
        .trim();

      if (company) return company;
    }
  }

  // 3) Fallback via métadonnées
  const metaOg = document.querySelector('meta[property="og:title"]')?.content || '';
  const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
  const candidates = [metaOg, metaDesc];
  for (const raw of candidates) {
    if (!raw) continue;
    const lower = raw.toLowerCase();
    const markers = [' chez ', ' at ', ' in ', ' with ', ' avec '];
    let idx = -1;
    let markerLen = 0;

    for (const m of markers) {
      const i = lower.indexOf(m);
      if (i !== -1 && (idx === -1 || i < idx)) {
        idx = i;
        markerLen = m.length;
      }
    }

    if (idx !== -1) {
      const company = raw
        .substring(idx + markerLen)
        .split(/[\|\-–]/)[0]
        .trim();
      if (company) return company;
    }
  }

  return '';
}

function readLatestExperience() {
  const expSection =
    document.querySelector('section[id*="experience"]') ||
    document.querySelector('section.pv-profile-section__section-info');

  if (!expSection) return { title: '', company: '' };

  const firstItem =
    expSection.querySelector('li.artdeco-list__item') ||
    expSection.querySelector('.pv-entity__position-group-role-item') ||
    expSection.querySelector('li');

  if (!firstItem) return { title: '', company: '' };

  let title = '';
  let company = '';

  const titleSelectors = [
    '.t-16.t-black.t-bold',
    '.mr1.t-bold span[aria-hidden="true"]',
    '.inline-show-more-text',
    'span[aria-hidden="true"]',
    '.pv-entity__summary-info h3',
    'h3'
  ];
  for (const sel of titleSelectors) {
    const el = firstItem.querySelector(sel);
    if (el && el.innerText?.trim()) {
      title = el.innerText.trim();
      break;
    }
  }

  const companySelectors = [
    '.t-14.t-normal',
    '.pv-entity__secondary-title',
    'a[href*="/company/"] span',
    'a[href*="/company/"]'
  ];
  for (const sel of companySelectors) {
    const el = firstItem.querySelector(sel);
    if (el && el.innerText?.trim()) {
      company = el.innerText.trim();
      break;
    }
  }

  return { title, company };
}

function readCompanyNameFromCompanyPage() {
  const selectors = [
    '.org-top-card-summary__title',
    '.org-top-card-module__title',
    '.org-top-card-primary-content__title',
    '[data-anonymize="company-name"]',
    'h1'
  ];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.innerText?.trim()) {
      return el.innerText.trim();
    }
  }
  const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
  const name = ogTitle.split('|')[0]?.trim() || ogTitle.trim();
  if (name) return name;
  return '';
}

function readCompanyInfoFromPage() {
  const infoItems = Array.from(
    document.querySelectorAll('.org-top-card-summary-info-list__info-item')
  )
    .map((el) => (el.innerText || '').trim())
    .filter(Boolean);

  let sizeText = '';
  let industryText = '';

  if (infoItems.length) {
    const sizeItem = infoItems.find((txt) => /employ/i.test(txt));
    if (sizeItem) sizeText = sizeItem;

    const industryItem = infoItems.find(
      (txt) => !/employ/i.test(txt) && !/follower/i.test(txt) && !/\d/.test(txt)
    );
    if (industryItem) industryText = industryItem;
  }

  const sizeSelectors = [
    '[data-anonymize="company-size"]',
    '.org-about-company-module__company-size-definition-text',
    '.org-about-company-module__company-size-definition-list',
    '.org-page-details__definition-text',
    'dd.org-about-company-module__definition-text'
  ];
  if (!sizeText) {
    for (const selector of sizeSelectors) {
      const el = document.querySelector(selector);
      if (el && el.innerText?.trim() && /employ/i.test(el.innerText)) {
        sizeText = el.innerText.trim();
        break;
      }
    }
  }

  if (!industryText) {
    const metaTitle = document.querySelector('meta[property="og:title"]')?.content || '';
    const metaDesc = document.querySelector('meta[property="og:description"]')?.content || '';
    const parts = `${metaTitle} ${metaDesc}`.split('|').map((p) => p.trim());
    const candidate = parts.find((p) => p && !/linkedin/i.test(p) && !/\d/.test(p));
    if (candidate) industryText = candidate;
  }

  return { sizeText, industryText };
}

function readHeadlineFromMeta() {
  const metaOg = document.querySelector('meta[property="og:description"]')?.content || '';
  const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
  const candidates = [metaOg, metaDesc, document.title || ''];

  for (const raw of candidates) {
    const candidate = (raw || '').trim();
    if (!candidate) continue;
    // LinkedIn sépare souvent par " | " ou " – "
    const parts = candidate
      .split(/[\|\u2013-]/)
      .map((p) => p.trim())
      .filter(Boolean);
    const best = parts.length ? parts[0] : candidate;
    if (best) return best;
  }
  return '';
}

function readProfileName() {
  const selectors = [
    '.pv-text-details__left-panel h1',
    '[data-anonymize="person-name"]',
    '.text-heading-xlarge',
    'h1.text-heading-xlarge',
    'h1[class*="text-heading"]',
    'main h1',
    'h1'
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (DEBUG_HEADLINE)
      debugLog('[LeadTracker][DEBUG] Name selector:', selector, el ? el.innerText : 'null');
    if (el && el.innerText?.trim()) {
      return el.innerText.trim();
    }
  }

  // Fallback depuis l'URL
  try {
    const urlObj = new URL(window.location.href);
    const pathParts = urlObj.pathname.split('/');
    const profileSlug = pathParts[pathParts.indexOf('in') + 1];
    if (profileSlug) {
      const nameFromUrl = decodeURIComponent(profileSlug)
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      return nameFromUrl;
    }
  } catch (e) {}

  return null;
}

function sendNotification(title, message) {
  try {
    chrome.runtime.sendMessage({
      type: 'SHOW_NOTIFICATION',
      title: title || 'LeadTracker',
      message: message || ''
    });
  } catch (e) {
    console.warn('[LeadTracker] Notification non envoyée:', e);
  }
}

async function autoCaptureProfileIfMatch() {
  if (autoCaptureInFlight) return;
  autoCaptureInFlight = true;
  try {
    const context = analyzePageContextOnce();
    if (context.contextType !== 'profile') return;

    const { profileName, profileHeadline, profileUrl, profileCompany } = context;
    if (!profileUrl) return;

    const storage = await chrome.storage.local.get(['searchTitles', 'leads']);
    const titles = storage.searchTitles || [];
    const leads = storage.leads || [];
    if (!titles.length) return;

    const headlineNorm = normalizeTitle(profileHeadline || '');
    const nameNorm = normalizeTitle(profileName || '');

    let matchedTitle = null;
    for (const t of titles) {
      const tNorm = normalizeTitle(t.label || '');
      if (!tNorm) continue;
      // Éviter les matchs sur 2 lettres ou moins (ex: PO dans "Paul", VP dans "Victor")
      // Cohérent avec handleScanSearchPage qui applique la même protection
      if (tNorm.length < 3) continue;
      // Utiliser regex avec word boundaries comme handleScanSearchPage pour cohérence
      // Cela évite les faux positifs (ex: "DATA" ne matchera pas "DATABASE")
      const pattern = new RegExp(`\\b${tNorm.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`);
      if ((headlineNorm && pattern.test(headlineNorm)) || (nameNorm && pattern.test(nameNorm))) {
        matchedTitle = t;
        break;
      }
    }

    if (!matchedTitle) {
      sendNotification(
        'Pas de correspondance',
        'Profil non associé à vos titres enregistrés. Ajoutez-le manuellement si besoin.'
      );
      return;
    }

    const already = leads.some((l) => l.profileUrl === profileUrl);
    if (already) {
      sendNotification(
        'Déjà enregistré',
        'Ce profil correspond à vos titres et est déjà dans vos leads.'
      );
      return;
    }

    const now = Date.now();
    const newLead = {
      id: now + '_' + Math.random().toString(36).slice(2),
      name: profileName || 'Inconnu',
      headline: profileHeadline || '',
      profileUrl: profileUrl,
      company: profileCompany || '',
      employeeRange: '',
      companySegment: '',
      companyIndustry: '',
      searchTitle: matchedTitle.label || '',
      direction: 'outbound_pending',
      requestDate: new Date().toISOString().split('T')[0],
      acceptanceDate: null,
      contacted: false,
      contactedDate: null,
      topLead: false,
      createdAt: now,
      updatedAt: now
    };

    leads.push(newLead);
    await chrome.storage.local.set({ leads });
    pushLeadsToSupabase([newLead]);
    sendNotification(
      'Lead enregistré',
      `Ajout automatique : ${profileName || matchedTitle.label || profileUrl}`
    );
  } catch (e) {
    console.warn('[LeadTracker] Auto-capture échouée:', e);
  } finally {
    autoCaptureInFlight = false;
  }
}

function triggerAutoCaptureIfProfile() {
  try {
    const urlObj = new URL(window.location.href);
    if (!urlObj.pathname.includes('/in/')) return;
    if (lastAutoCapturePath === urlObj.pathname) return;
    lastAutoCapturePath = urlObj.pathname;
    setTimeout(autoCaptureProfileIfMatch, AUTO_CAPTURE_DELAY_MS);
  } catch (e) {
    console.warn("[LeadTracker] Impossible de lancer l'auto-capture:", e);
  }
}

async function scanNetworkPageForAcceptances() {
  try {
    const urlObj = new URL(window.location.href);
    const path = urlObj.pathname || '';
    const isNetworkPage =
      path.startsWith('/mynetwork/grow/') ||
      path.startsWith('/mynetwork/invite-connect/connections/');
    if (!isNetworkPage) return;
    if (lastNetworkScanPath === path) return;
    lastNetworkScanPath = path;

    const anchors = Array.from(document.querySelectorAll('a[href*="/in/"]')).slice(0, 50);
    const profileUrls = new Set();
    anchors.forEach((a) => {
      try {
        const u = new URL(a.href);
        profileUrls.add(u.origin + u.pathname.split('?')[0]);
      } catch (e) {}
    });
    if (!profileUrls.size) return;

    const { leads = [] } = await chrome.storage.local.get(['leads']);
    let updated = false;
    const today = new Date().toISOString().split('T')[0];

    const updatedLeadIds = [];
    leads.forEach((l) => {
      if (l.direction === 'outbound_pending' && profileUrls.has(l.profileUrl)) {
        l.direction = 'outbound_accepted';
        l.acceptanceDate = l.acceptanceDate || today;
        l.updatedAt = Date.now();
        updatedLeadIds.push(l.id);
        updated = true;
      }
    });

    if (updated) {
      await chrome.storage.local.set({ leads });
      // Synchroniser automatiquement avec Supabase
      const updatedLeads = leads.filter(l => updatedLeadIds.includes(l.id));
      if (updatedLeads.length) {
        pushLeadsToSupabase(updatedLeads);
      }
      sendNotification('Connexions détectées', 'Certains leads ont été marqués comme acceptés.');
    }
  } catch (e) {
    console.warn('[LeadTracker] Scan mynetwork échoué:', e);
  }
}

/**
 * Extrait les informations d'un profil depuis une carte de résultat de recherche
 * SÉCURITÉ: Lecture unique du DOM, déclenchée uniquement par clic utilisateur
 */
function findProfileCard(buttonElement) {
  if (!buttonElement) return null;
  let card =
    buttonElement.closest('[data-chameleon-result-urn]') ||
    buttonElement.closest('.reusable-search__result-container') ||
    buttonElement.closest('.entity-result') ||
    buttonElement.closest('[data-view-name="search-entity-result-universal-template"]') ||
    buttonElement.closest('li[class*="reusable-search"]');

  if (card) return card;

  // Fallback : chercher dans un rayon plus large
  let parent = buttonElement.parentElement;
  for (let i = 0; i < 15 && parent; i++) {
    const hasProfileLink = parent.querySelector('a[href*="/in/"]');
    if (hasProfileLink) {
      card = parent;
      break;
    }
    parent = parent.parentElement;
  }
  return card || null;
}

/**
 * Extrait les informations d'un profil depuis une carte de résultat de recherche
 * SÉCURITÉ: Lecture unique du DOM, déclenchée uniquement par clic utilisateur
 */
function extractProfileFromSearchCard(buttonElement, providedCard = null) {
  try {
    const card = providedCard || findProfileCard(buttonElement);

    if (!card) {
      console.warn('[LeadTracker] Carte de profil non trouvée');
      return null;
    }

    // Extraire l'URL du profil (priorité 1) - essayer plusieurs sélecteurs
    let profileLink = card.querySelector('a[href*="/in/"]');
    if (!profileLink) {
      // Chercher dans toute la carte
      const allLinks = card.querySelectorAll('a');
      for (const link of allLinks) {
        if (link.href && link.href.includes('/in/')) {
          profileLink = link;
          break;
        }
      }
    }

    let profileUrl = null;
    let profileName = null;

    if (profileLink && profileLink.href) {
      try {
        const urlObj = new URL(profileLink.href);
        profileUrl = urlObj.origin + urlObj.pathname.split('?')[0]; // Nettoyer l'URL

        // Le nom est souvent dans le lien ou juste à côté
        profileName =
          profileLink.textContent?.trim() ||
          profileLink.querySelector('span[aria-hidden="true"]')?.textContent?.trim() ||
          profileLink.querySelector('span')?.textContent?.trim() ||
          profileLink.getAttribute('aria-label')?.trim();
      } catch (e) {
        console.error('[LeadTracker] Erreur parsing URL:', e);
      }
    }

    // Si pas de nom depuis le lien, chercher ailleurs dans la carte
    if (!profileName) {
      const nameSelectors = [
        '.entity-result__title-text a',
        '.entity-result__title a',
        'a[href*="/in/"] span[aria-hidden="true"]',
        'span.entity-result__title-text',
        'h3 a',
        '[class*="title"] a',
        'a[href*="/in/"]'
      ];

      for (const selector of nameSelectors) {
        const nameEl = card.querySelector(selector);
        if (nameEl) {
          profileName =
            nameEl.innerText?.trim() ||
            nameEl.textContent?.trim() ||
            nameEl.getAttribute('aria-label')?.trim();
          if (profileName) break;
        }
      }
    }

    // Extraire le headline avec plusieurs sélecteurs
    const headlineSelectors = [
      '.entity-result__primary-subtitle',
      '.entity-result__summary',
      '.entity-result__subtitle',
      '[class*="subtitle"]',
      '[class*="summary"]'
    ];

    let profileHeadline = '';
    for (const selector of headlineSelectors) {
      const headlineEl = card.querySelector(selector);
      if (headlineEl) {
        profileHeadline = headlineEl.innerText?.trim() || headlineEl.textContent?.trim() || '';
        if (profileHeadline) break;
      }
    }

    if (!profileName || !profileUrl) {
      console.warn('[LeadTracker] Infos incomplètes - Nom:', profileName, 'URL:', profileUrl);
      return null;
    }

    return {
      name: profileName,
      headline: profileHeadline,
      url: profileUrl
    };
  } catch (error) {
    console.error('[LeadTracker] Erreur extraction profil:', error);
    return null;
  }
}

/**
 * Détecte les clics sur les boutons "Connect" dans les résultats de recherche
 * SÉCURITÉ: Déclenché uniquement par action manuelle de l'utilisateur
 */
function setupConnectButtonListener() {
  console.log('[LeadTracker] Configuration du listener Connect...');

  // Utiliser la délégation d'événements pour gérer les boutons dynamiques
  document.addEventListener(
    'click',
    async (e) => {
      const target = e.target;

      // Vérifier qu'on est sur une page de recherche
      if (!window.location.href.includes('/search/results/people')) {
        // Log seulement si on clique sur un bouton (pour éviter trop de logs)
        if (target.closest('button')) {
          console.log(
            '[LeadTracker] Clic détecté mais pas sur page de recherche:',
            window.location.href
          );
        }
        return;
      }

      console.log('[LeadTracker] Clic détecté sur page de recherche');

      // Chercher le bouton (ou élément role=button) le plus proche
      let button = target.closest('button, [role="button"]');
      if (!button && (target.tagName === 'BUTTON' || target.getAttribute('role') === 'button')) {
        button = target;
      }
      if (!button) return;

      // Vérifier le texte ou aria-label du bouton (plusieurs variantes)
      const buttonText = (button.textContent || '').trim().toLowerCase();
      const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
      const buttonId = (button.getAttribute('id') || '').toLowerCase();
      const buttonClass = (button.getAttribute('class') || '').toLowerCase();

      // Vérifier aussi dans les spans enfants
      const spans = button.querySelectorAll('span');
      let spanText = '';
      spans.forEach((span) => {
        const text = (span.textContent || '').trim().toLowerCase();
        if (text.includes('connect') || text.includes('se connecter') || text.includes('pending')) {
          spanText = text;
        }
      });

      // Vérifier aussi dans les éléments parents (parfois le texte est dans un parent)
      let parentText = '';
      let parent = button.parentElement;
      for (let i = 0; i < 3 && parent; i++) {
        const text = (parent.textContent || '').trim().toLowerCase();
        if (text.includes('connect') || text.includes('se connecter')) {
          parentText = text;
          break;
        }
        parent = parent.parentElement;
      }

      const isConnectButton =
        buttonText.includes('connect') ||
        buttonText.includes('se connecter') ||
        buttonText.includes('pending') ||
        ariaLabel.includes('connect') ||
        ariaLabel.includes('se connecter') ||
        spanText.includes('connect') ||
        spanText.includes('se connecter') ||
        parentText.includes('connect') ||
        buttonId.includes('connect') ||
        buttonClass.includes('connect');

      if (!isConnectButton) return;

      // Capturer la carte immédiatement (avant un éventuel re-render LinkedIn)
      const initialCard = findProfileCard(button);

      console.log('[LeadTracker] ✅ Clic sur Connect détecté!', {
        buttonText,
        ariaLabel,
        buttonId,
        url: window.location.href,
        cardFound: !!initialCard
      });

      // Petit délai pour laisser LinkedIn mettre à jour le bouton (devient "Pending")
      setTimeout(async () => {
        // Extraire les infos du profil depuis la carte
        const profileInfo = extractProfileFromSearchCard(button, initialCard);

        if (profileInfo) {
          console.log('[LeadTracker] ✅ Profil extrait:', profileInfo);

          // Stocker temporairement les infos pour le popup
          await chrome.storage.local.set({
            pendingLead: {
              ...profileInfo,
              timestamp: Date.now()
            }
          });

          // Afficher un badge sur l'icône pour indiquer qu'il y a un lead en attente
          chrome.runtime
            .sendMessage({
              type: 'SHOW_BADGE',
              text: '1'
            })
            .catch((err) => {
              console.warn('[LeadTracker] Erreur envoi badge:', err);
            });

          console.log('[LeadTracker] ✅ Lead en attente sauvegardé dans storage');
        } else {
          console.warn(
            "[LeadTracker] ❌ Impossible d'extraire les infos du profil depuis la carte"
          );
          console.log('[LeadTracker] Debug - Bouton:', button);
          console.log('[LeadTracker] Debug - Parent:', button.parentElement);
        }
      }, 300); // Augmenter le délai pour laisser LinkedIn charger
    },
    true
  ); // Utiliser capture pour intercepter tôt

  console.log('[LeadTracker] ✅ Listener Connect configuré');
}

// Initialiser le listener au chargement
console.log('[LeadTracker] Initialisation du listener Connect...');
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[LeadTracker] DOM chargé, setup du listener');
    setupConnectButtonListener();
    triggerAutoCaptureIfProfile();
    scanNetworkPageForAcceptances();
  });
} else {
  console.log('[LeadTracker] DOM déjà chargé, setup immédiat');
  setupConnectButtonListener();
  triggerAutoCaptureIfProfile();
  scanNetworkPageForAcceptances();
}

// Vérifier qu'on est sur LinkedIn
if (window.location.href.includes('linkedin.com')) {
  console.log('[LeadTracker] Page LinkedIn détectée:', window.location.href);
} else {
  console.log('[LeadTracker] Page non-LinkedIn:', window.location.href);
}
