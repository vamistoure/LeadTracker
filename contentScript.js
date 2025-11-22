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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_PAGE_CONTEXT") {
    // Rate limiting: vérifier qu'on ne fait pas trop d'appels
    const now = Date.now();
    if (now - lastCallTime < MIN_CALL_INTERVAL_MS) {
      console.warn("[LeadTracker] Appel trop rapide, rate limiting activé");
      sendResponse({ contextType: "other", error: "rate_limited" });
      return false;
    }
    try {
      handleGetPageContext(sendResponse);
    } catch (error) {
      console.error("[LeadTracker] Erreur analyse contexte:", error);
      sendResponse({ contextType: "other", error: error.message });
    }
    return true;
  }
  return false;
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleGetPageContext(sendResponse) {
  try {
    let context = analyzePageContextOnce();
    if (context.contextType === "profile" && !context.profileHeadline) {
      for (let attempt = 0; attempt < MAX_HEADLINE_RETRIES; attempt++) {
        await sleep(HEADLINE_RETRY_DELAY_MS);
        context = analyzePageContextOnce();
        if (context.profileHeadline) break;
      }
    }
    console.log("[LeadTracker] Contexte détecté:", context);
    lastCallTime = Date.now();
    sendResponse(context);
  } catch (error) {
    console.error("[LeadTracker] Erreur analyse contexte:", error);
    sendResponse({ contextType: "other", error: error.message });
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
  if (url.includes("/search/results/people/") || (url.includes("/company/") && url.includes("/people"))) {
    let keyword = "";
    
    if (url.includes("/search/results/people/")) {
      // Tentative 1: URL param
      try {
        const urlObj = new URL(url);
        keyword = urlObj.searchParams.get("keywords");
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
      contextType: "search",
      searchKeyword: keyword || "",
      profileName: null,
      profileHeadline: null,
      profileUrl: null
    };
  }

  // --- CONTEXTE : PROFIL ---
  if (url.includes("/in/")) {
    // IMPORTANT: Lecture unique du DOM - pas de scraping intensif
    // On lit uniquement les éléments déjà chargés sur la page actuelle
    // Sélecteurs "Best effort" pour LinkedIn (la structure change souvent)
    
    // Lecture unique du texte - pas de manipulation du DOM
    let profileName = readProfileName();
    const profileHeadline = readProfileHeadline();

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
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
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
      contextType: "profile",
      searchKeyword: null,
      profileName: profileName,
      profileHeadline: profileHeadline,
      profileUrl: cleanUrl
    };
  }

  // --- CONTEXTE : AUTRE ---
  return { contextType: "other" };
}

function debugLog(...args) {
  if (DEBUG_HEADLINE) {
    console.log(...args);
  }
}

// Stratégie headline:
// 1) Sélecteurs DOM modernes LinkedIn (data-anonymize, top-card)
// 2) Métadonnées og:description / meta description
// 3) Document title en dernier recours
function readProfileHeadline() {
  const selectors = [
    '[data-anonymize="headline"]',
    '.pv-text-details__left-panel .text-body-medium',
    '.pv-text-details__left-panel .text-body-small',
    '.pv-text-details__right-panel .text-body-medium',
    '.pv-text-details__right-panel .text-body-small',
    '.text-body-medium.break-words',
    '.text-body-medium',
    'div[class*="text-body-medium"]',
    'section.pv-top-card h2',
    'section.pv-top-card span.text-body-medium',
    'main h2[data-anonymize="headline"]',
    'main [data-anonymize="headline"]',
    'main h2',
    'main [dir="ltr"]'
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (DEBUG_HEADLINE) debugLog("[LeadTracker][DEBUG] Headline selector:", selector, el ? el.innerText : 'null');
    if (el && el.innerText?.trim()) {
      return el.innerText.trim();
    }
  }

  // Fallback métadonnées
  const metaHeadline = readHeadlineFromMeta();
  if (metaHeadline) {
    debugLog("[LeadTracker][DEBUG] Headline from meta:", metaHeadline);
    return metaHeadline;
  }

  debugLog("[LeadTracker][DEBUG] Headline toujours vide après sélecteurs et métas.");
  return "";
}

function readHeadlineFromMeta() {
  const metaOg = document.querySelector('meta[property="og:description"]')?.content || '';
  const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
  const candidates = [metaOg, metaDesc, document.title || ''];

  for (const raw of candidates) {
    const candidate = (raw || '').trim();
    if (!candidate) continue;
    // LinkedIn sépare souvent par " | " ou " – "
    const parts = candidate.split(/[\|\u2013-]/).map(p => p.trim()).filter(Boolean);
    const best = parts.length ? parts[0] : candidate;
    if (best) return best;
  }
  return "";
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
    if (DEBUG_HEADLINE) debugLog("[LeadTracker][DEBUG] Name selector:", selector, el ? el.innerText : 'null');
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
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      return nameFromUrl;
    }
  } catch (e) {}

  return null;
}
function readProfileHeadline() {
  const selectors = [
    '.text-body-medium.break-words',
    '.pv-text-details__left-panel .text-body-medium',
    '[data-generated-suggestion-target]',
    '.text-body-medium',
    'div[class*="text-body-medium"]',
    '[data-anonymize="headline"]',
    'section.artdeco-card div.inline-show-more-text',
    'main [dir="ltr"]',
    'main h2'
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.innerText?.trim()) {
      return el.innerText.trim();
    }
  }
  return "";
}

/**
 * Extrait les informations d'un profil depuis une carte de résultat de recherche
 * SÉCURITÉ: Lecture unique du DOM, déclenchée uniquement par clic utilisateur
 */
function findProfileCard(buttonElement) {
  if (!buttonElement) return null;
  let card = buttonElement.closest('[data-chameleon-result-urn]') 
          || buttonElement.closest('.reusable-search__result-container')
          || buttonElement.closest('.entity-result')
          || buttonElement.closest('[data-view-name="search-entity-result-universal-template"]')
          || buttonElement.closest('li[class*="reusable-search"]');
  
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
        profileName = profileLink.textContent?.trim() 
                   || profileLink.querySelector('span[aria-hidden="true"]')?.textContent?.trim()
                   || profileLink.querySelector('span')?.textContent?.trim()
                   || profileLink.getAttribute('aria-label')?.trim();
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
          profileName = nameEl.innerText?.trim() 
                     || nameEl.textContent?.trim()
                     || nameEl.getAttribute('aria-label')?.trim();
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
    
    let profileHeadline = "";
    for (const selector of headlineSelectors) {
      const headlineEl = card.querySelector(selector);
      if (headlineEl) {
        profileHeadline = headlineEl.innerText?.trim() || headlineEl.textContent?.trim() || "";
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
    console.error("[LeadTracker] Erreur extraction profil:", error);
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
  document.addEventListener('click', async (e) => {
    const target = e.target;
    
    // Vérifier qu'on est sur une page de recherche
    if (!window.location.href.includes("/search/results/people")) {
      // Log seulement si on clique sur un bouton (pour éviter trop de logs)
      if (target.closest('button')) {
        console.log('[LeadTracker] Clic détecté mais pas sur page de recherche:', window.location.href);
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
    spans.forEach(span => {
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
    
    const isConnectButton = buttonText.includes('connect') 
                         || buttonText.includes('se connecter')
                         || buttonText.includes('pending')
                         || ariaLabel.includes('connect')
                         || ariaLabel.includes('se connecter')
                         || spanText.includes('connect')
                         || spanText.includes('se connecter')
                         || parentText.includes('connect')
                         || buttonId.includes('connect')
                         || buttonClass.includes('connect');

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
        chrome.runtime.sendMessage({
          type: "SHOW_BADGE",
          text: "1"
        }).catch((err) => {
          console.warn('[LeadTracker] Erreur envoi badge:', err);
        });
        
        console.log('[LeadTracker] ✅ Lead en attente sauvegardé dans storage');
      } else {
        console.warn('[LeadTracker] ❌ Impossible d\'extraire les infos du profil depuis la carte');
        console.log('[LeadTracker] Debug - Bouton:', button);
        console.log('[LeadTracker] Debug - Parent:', button.parentElement);
      }
    }, 300); // Augmenter le délai pour laisser LinkedIn charger
  }, true); // Utiliser capture pour intercepter tôt
  
  console.log('[LeadTracker] ✅ Listener Connect configuré');
}

// Initialiser le listener au chargement
console.log('[LeadTracker] Initialisation du listener Connect...');
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[LeadTracker] DOM chargé, setup du listener');
    setupConnectButtonListener();
  });
} else {
  console.log('[LeadTracker] DOM déjà chargé, setup immédiat');
  setupConnectButtonListener();
}

// Vérifier qu'on est sur LinkedIn
if (window.location.href.includes('linkedin.com')) {
  console.log('[LeadTracker] Page LinkedIn détectée:', window.location.href);
} else {
  console.log('[LeadTracker] Page non-LinkedIn:', window.location.href);
}
