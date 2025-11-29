/**
 * Utilitaire : Calculer la différence en jours entre deux dates YYYY-MM-DD
 */
function getDaysDifference(dateString) {
  if (!dateString) return -1;
  const oneDay = 24 * 60 * 60 * 1000;
  const acceptanceDate = new Date(dateString);
  const today = new Date();

  // Reset des heures pour comparer uniquement les jours
  acceptanceDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((today - acceptanceDate) / oneDay);
  return diffDays;
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

const DEFAULT_TITLES_V1 = [
  'Chief Data Officer (CDO)',
  'Chief Technology Officer (CTO) orienté Data / Analytics / IA',
  'Vice President Data',
  'Vice President Analytics',
  'Head of Data',
  'Head of Analytics',
  'Head of Business Intelligence (BI)',
  'Lead Data Scientist',
  'Senior Data Scientist',
  'Lead Data Engineer',
  'Data Engineering Manager',
  'Head of Data Engineering',
  'Technical Lead Data',
  'Tech Lead BI',
  'Tech Lead Analytics',
  'Analytics Engineer',
  'Senior Analytics Engineer',
  'Data Architect',
  'Chief Data Architect',
  'Product Owner Data',
  'Data Product Manager',
  'Product Manager Data',
  'Data Manager',
  'Data Team Manager',
  'Business Intelligence Manager',
  'BI Manager',
  'Directeur Data',
  'Directeur Analytics',
  'Directeur BI',
  'Senior Data Analyst',
  'Data Analyst Lead',
  'Responsable Data Analyst',
  'Data Trainer',
  'Data Coach',
  'BI Trainer',
  'Analytics Coach',
  'Responsable équipe Data',
  'Team Leader Analytics',
  'Responsable RH Data',
  'HR Data Manager',
  'HR Analytics Manager',
  'HR Big Data Manager'
];

const DEFAULT_TITLES_V2 = [
  'Chief Product Officer (CPO)',
  'VP Product',
  'Head of Product',
  'Product Director',
  'Product Lead',
  'Product Manager',
  'Head of Platform',
  'VP Platform',
  'Head of Cloud',
  'VP Cloud',
  'Cloud Director',
  'CTO Cloud',
  'CTO Product',
  'Director of Cloud Engineering',
  'Head of Cloud Engineering'
];

const DEFAULT_TITLES_V3 = [
  'CTPO',
  'Chief Technology Product Officer',
  'Chief Product and Technology Officer',
  'Head of Product & Tech',
  'VP Product & Technology'
];

// --- Supabase minimal helpers (push only) ---
const SUPABASE_URL = 'https://hcahvwbzgyeqkamephzn.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjYWh2d2J6Z3llcWthbWVwaHpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNjYyNDgsImV4cCI6MjA3OTc0MjI0OH0.wZu336fqjSTbCipcaVvni-MKT9iXB9uaO28gm8a5B-Y';

// Fonction de conversion camelCase → snake_case (identique à supabaseSync.js)
function convertLeadToSupabase(lead) {
  if (!lead) return lead;
  const converted = { ...lead };
  const mapping = {
    profileUrl: 'profile_url',
    searchTitle: 'search_title',
    requestDate: 'request_date',
    acceptanceDate: 'acceptance_date',
    contactedDate: 'contacted_date',
    conversionDate: 'conversion_date',
    topLead: 'top_lead',
    employeeRange: 'employee_range',
    companySegment: 'company_segment',
    companyIndustry: 'company_industry',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  };
  Object.keys(mapping).forEach((camelKey) => {
    if (camelKey in converted) {
      converted[mapping[camelKey]] = converted[camelKey];
      delete converted[camelKey];
    }
  });
  
  // Convertir les timestamps numériques en ISO strings pour created_at et updated_at
  // Supprimer si null/undefined pour que Supabase utilise les defaults
  if ('created_at' in converted) {
    if (converted.created_at && typeof converted.created_at === 'number') {
      converted.created_at = new Date(converted.created_at).toISOString();
    } else if (!converted.created_at) {
      delete converted.created_at; // Laisser Supabase utiliser le default
    }
  }
  if ('updated_at' in converted) {
    if (converted.updated_at && typeof converted.updated_at === 'number') {
      converted.updated_at = new Date(converted.updated_at).toISOString();
    } else if (!converted.updated_at) {
      delete converted.updated_at; // Laisser Supabase utiliser le default
    }
  }
  
  // Ne pas envoyer l'ID si ce n'est pas un UUID valide (Supabase génère les UUIDs)
  // Les IDs locaux comme "1763817835094_54dio3b78kq" ne sont pas valides
  if (converted.id && !converted.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    delete converted.id;
  }
  
  return converted;
}

// Extraire user_id depuis le token JWT
function getUserIdFromToken(token) {
  try {
    if (!token || typeof token !== 'string') {
      console.warn('[LeadTracker] Token invalide ou manquant');
      return null;
    }
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.warn('[LeadTracker] Format de token JWT invalide');
      return null;
    }
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(jsonPayload);
    const userId = payload.sub || payload.user_id || null;
    if (!userId) {
      console.warn('[LeadTracker] user_id non trouvé dans le token JWT', payload);
    }
    return userId;
  } catch (e) {
    console.error('[LeadTracker] Erreur extraction user_id du token:', e);
    return null;
  }
}

async function pushToSupabase(leads = [], searchTitles = [], events = []) {
  try {
    if ((!leads || !leads.length) && (!searchTitles || !searchTitles.length) && (!events || !events.length)) {
      return;
    }
    const { supabaseAccessToken, supabaseUser } = await chrome.storage.local.get([
      'supabaseAccessToken',
      'supabaseUser'
    ]);
    if (!supabaseAccessToken) {
      console.warn('[LeadTracker] Pas de token Supabase, push annulé. Connectez-vous dans options.html');
      return;
    }

    // Extraire user_id depuis le token
    const userId = getUserIdFromToken(supabaseAccessToken);
    if (!userId) {
      console.error('[LeadTracker] Impossible d\'extraire user_id du token. Le token est peut-être expiré ou invalide.');
      console.error('[LeadTracker] Veuillez vous reconnecter à Supabase dans options.html');
      // Nettoyer le token invalide
      await chrome.storage.local.remove(['supabaseAccessToken', 'supabaseUser']);
      return;
    }
    
    console.log('[LeadTracker] ✅ Configuration Supabase:', {
      hasToken: !!supabaseAccessToken,
      userId: userId,
      timestamp: new Date().toISOString()
    });

    const headers = {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseAccessToken}`,
      Prefer: 'return=representation,resolution=merge-duplicates'
    };

    const tasks = [];
    if (searchTitles && searchTitles.length) {
      console.log('[LeadTracker] 🔄 Début synchronisation search_titles:', {
        count: searchTitles.length,
        timestamp: new Date().toISOString()
      });
      
      // Ajouter user_id aux search_titles
      const titlesWithUserId = searchTitles.map((t) => ({
        ...t,
        user_id: userId,
        label: t.label || t.label
      }));
      tasks.push(
        fetch(`${SUPABASE_URL}/rest/v1/search_titles`, {
          method: 'POST',
          headers,
          body: JSON.stringify(titlesWithUserId)
        }).then(async (res) => {
          if (!res.ok) {
            const text = await res.text();
            let errorDetails;
            try {
              errorDetails = JSON.parse(text);
            } catch (_) {
              errorDetails = text;
            }
            console.error('[LeadTracker] ❌ Erreur push search_titles:', {
              status: res.status,
              statusText: res.statusText,
              error: errorDetails,
              titlesCount: titlesWithUserId.length
            });
            throw new Error(`Supabase error ${res.status}: ${JSON.stringify(errorDetails)}`);
          }
          const results = await res.json();
          console.log('[LeadTracker] ✅ Search_titles synchronisés:', {
            count: Array.isArray(results) ? results.length : 1,
            timestamp: new Date().toISOString()
          });
          return results;
        }).catch((error) => {
          console.error('[LeadTracker] ❌ Exception lors de la synchronisation search_titles:', error);
          throw error;
        })
      );
    }
    if (leads && leads.length) {
      console.log('[LeadTracker] 🔄 Début synchronisation leads:', {
        count: leads.length,
        timestamp: new Date().toISOString()
      });
      
      // Convertir camelCase → snake_case et ajouter user_id
      const leadsWithUserId = leads.map((lead) => {
        const converted = convertLeadToSupabase(lead);
        // Ne pas envoyer l'ID si c'est un ID local (format timestamp_random)
        // Seuls les UUIDs valides sont acceptés par Supabase
        const { id, ...leadWithoutId } = converted;
        
        // S'assurer que tous les champs sont préservés, y compris company
        const finalLead = {
          ...leadWithoutId,
          user_id: userId
        };
        
        // Log pour debug - vérifier que company est présent
        if (lead.company && !finalLead.company) {
          console.warn('[LeadTracker] ⚠️ Champ company perdu lors de la conversion:', {
            original: lead.company,
            converted: converted.company,
            final: finalLead.company
          });
        }
        
        return finalLead;
      });
      
      // Utiliser POST direct avec resolution=merge-duplicates (comme supabaseSync.js)
      // Note: Pour un vrai upsert, il faudrait une contrainte UNIQUE sur profile_url+user_id
      tasks.push(
        fetch(`${SUPABASE_URL}/rest/v1/leads`, {
          method: 'POST',
          headers: {
            ...headers,
            Prefer: 'return=representation,resolution=merge-duplicates'
          },
          body: JSON.stringify(leadsWithUserId)
        }).then(async (res) => {
          if (!res.ok) {
            const text = await res.text();
            let errorDetails;
            try {
              errorDetails = JSON.parse(text);
            } catch (_) {
              errorDetails = text;
            }
            console.error('[LeadTracker] ❌ Erreur push leads:', {
              status: res.status,
              statusText: res.statusText,
              error: errorDetails,
              leadsCount: leadsWithUserId.length
            });
            throw new Error(`Supabase error ${res.status}: ${JSON.stringify(errorDetails)}`);
          }
          const results = await res.json();
          console.log('[LeadTracker] ✅ Leads synchronisés:', {
            count: Array.isArray(results) ? results.length : 1,
            timestamp: new Date().toISOString()
          });
          return { ok: true, count: Array.isArray(results) ? results.length : 1, results };
        }).catch((error) => {
          console.error('[LeadTracker] ❌ Exception lors de la synchronisation leads:', error);
          throw error;
        })
      );
    }
    if (events && events.length) {
      console.log('[LeadTracker] 🔄 Début synchronisation events:', {
        count: events.length,
        timestamp: new Date().toISOString()
      });
      
      const eventsWithUserId = events.map((e) => ({
        ...e,
        user_id: userId
      }));
      tasks.push(
        fetch(`${SUPABASE_URL}/rest/v1/lead_events`, {
          method: 'POST',
          headers,
          body: JSON.stringify(eventsWithUserId)
        }).then(async (res) => {
          if (!res.ok) {
            const text = await res.text();
            let errorDetails;
            try {
              errorDetails = JSON.parse(text);
            } catch (_) {
              errorDetails = text;
            }
            console.error('[LeadTracker] ❌ Erreur push events:', {
              status: res.status,
              statusText: res.statusText,
              error: errorDetails,
              eventsCount: eventsWithUserId.length
            });
            throw new Error(`Supabase error ${res.status}: ${JSON.stringify(errorDetails)}`);
          }
          const results = await res.json();
          console.log('[LeadTracker] ✅ Events synchronisés:', {
            count: Array.isArray(results) ? results.length : 1,
            timestamp: new Date().toISOString()
          });
          return results;
        }).catch((error) => {
          console.error('[LeadTracker] ❌ Exception lors de la synchronisation events:', error);
          throw error;
        })
      );
    }
    await Promise.all(tasks);
    await chrome.storage.local.set({ supabaseLastSync: new Date().toISOString() });
    console.log('[LeadTracker] ✅ Synchronisation Supabase réussie:', {
      leads: leads.length,
      titles: searchTitles.length,
      events: events.length,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error('[LeadTracker] ❌ pushToSupabase failed:', {
      error: e,
      message: e?.message,
      stack: e?.stack,
      timestamp: new Date().toISOString()
    });
    // Ne pas throw pour éviter de bloquer l'application
    // Les erreurs sont déjà loggées en détail dans chaque section
  }
}

async function seedDefaultTitles() {
  try {
    const {
      searchTitles = [],
      searchTitlesSeeded_v1,
      searchTitlesSeeded_v2,
      searchTitlesSeeded_v3
    } = await chrome.storage.local.get([
      'searchTitles',
      'searchTitlesSeeded_v1',
      'searchTitlesSeeded_v2',
      'searchTitlesSeeded_v3'
    ]);
    const existingLabels = new Set(searchTitles.map((t) => (t.label || '').trim().toUpperCase()));
    let updated = [...searchTitles];

    const mergeTitles = (titles) => {
      const toAdd = [];
      titles.forEach((label) => {
        const norm = (label || '').trim().toUpperCase();
        if (!norm) return;
        if (!existingLabels.has(norm)) {
          toAdd.push({
            id: 'default_' + norm.replace(/[^A-Z0-9]/g, '_'),
            label,
            createdAt: Date.now()
          });
          existingLabels.add(norm);
        }
      });
      if (toAdd.length) {
        updated = [...updated, ...toAdd];
      }
      return toAdd.length > 0;
    };

    let added = false;
    if (!searchTitlesSeeded_v1) {
      added = mergeTitles(DEFAULT_TITLES_V1) || added;
    }
    if (!searchTitlesSeeded_v2) {
      added = mergeTitles(DEFAULT_TITLES_V2) || added;
    }
    if (!searchTitlesSeeded_v3) {
      added = mergeTitles(DEFAULT_TITLES_V3) || added;
    }

    if (!added) return;

    await chrome.storage.local.set({
      searchTitles: updated,
      searchTitlesSeeded_v1: true,
      searchTitlesSeeded_v2: true,
      searchTitlesSeeded_v3: true
    });
    console.log('[LeadTracker] Titres par défaut ajoutés (v3).');
  } catch (e) {
    console.warn('[LeadTracker] Impossible de semer les titres par défaut:', e);
  }
}

async function rationalizeTitlesAndLeads() {
  try {
    const { leads = [], searchTitles = [] } = await chrome.storage.local.get([
      'leads',
      'searchTitles'
    ]);
    if (!leads.length && !searchTitles.length) return;

    const canonicalByNorm = new Map();
    const uniqueTitles = [];
    searchTitles.forEach((t) => {
      const norm = normalizeTitle(t.label || '');
      if (!norm) return;
      if (!canonicalByNorm.has(norm)) {
        const canonicalLabel = norm; // on stocke le label rationalisé
        canonicalByNorm.set(norm, canonicalLabel);
        uniqueTitles.push({
          ...t,
          label: canonicalLabel
        });
      }
    });

    let changedTitles = uniqueTitles.length !== searchTitles.length;
    const now = Date.now();
    let changedLeads = false;
    const updatedLeads = leads.map((l) => {
      const norm = normalizeTitle(l.searchTitle || '');
      if (!norm) return l;
      const canonical = canonicalByNorm.get(norm) || norm;
      if (l.searchTitle !== canonical) {
        changedLeads = true;
        return {
          ...l,
          searchTitle: canonical,
          updatedAt: now
        };
      }
      return l;
    });

    if (changedTitles || changedLeads) {
      await chrome.storage.local.set({
        leads: updatedLeads,
        searchTitles: uniqueTitles
      });
      console.log('[LeadTracker] Titres rationalisés (leads et liste).');
    }
  } catch (e) {
    console.warn('[LeadTracker] Rationalisation échouée:', e);
  }
}

/**
 * Initialisation de l'alarme quotidienne
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installée. Création de l'alarme quotidienne.");
  // Vérification quotidienne (toutes les 1440 minutes = 24h)
  chrome.alarms.create('daily-check', { periodInMinutes: 1440 });
  seedDefaultTitles().then(rationalizeTitlesAndLeads);

  // Ouvrir l'onboarding à l'installation
  try {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  } catch (e) {
    console.warn('Ouverture onboarding échouée:', e);
  }
});

chrome.runtime.onStartup.addListener(() => {
  seedDefaultTitles().then(rationalizeTitlesAndLeads);
});

/**
 * Gestion de l'alarme
 */
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'daily-check') {
    checkLeadsForNotification();
  }
});

function createNotificationSafe({ title, message, priority = 1, tag = '' }) {
  if (!chrome.notifications) return;

  const create = () => {
    chrome.notifications.create(
      tag || `lead-${Date.now()}`,
      {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: title || 'LeadTracker',
        message: message || '',
        priority: priority,
        requireInteraction: false
      },
      () => {
        if (chrome.runtime.lastError) {
          console.warn('[LeadTracker] Notification error:', chrome.runtime.lastError.message);
        }
      }
    );
  };

  if (chrome.notifications.getPermissionLevel) {
    chrome.notifications.getPermissionLevel((level) => {
      if (level === 'denied') {
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#e63946' });
        return;
      }
      create();
    });
  } else {
    create();
  }
}

/**
 * Vérifie les leads et notifie si nécessaire (J+5 à J+7)
 */
function checkLeadsForNotification() {
  chrome.storage.local.get(['leads'], (result) => {
    const leads = result.leads || [];
    let leadsToContactCount = 0;
    let detailsByTitle = {};

    leads.forEach((lead) => {
      // Ignorer les leads en attente (pas de date d'acceptation)
      if (!lead.acceptanceDate) return;

      const days = getDaysDifference(lead.acceptanceDate);
      // Critères : Pas encore contacté ET entre 5 et 7 jours après acceptation
      if (!lead.contacted && days === 5) {
        leadsToContactCount++;

        // Agrégation par titre pour le message
        if (!detailsByTitle[lead.searchTitle]) {
          detailsByTitle[lead.searchTitle] = 0;
        }
        detailsByTitle[lead.searchTitle]++;
      }
    });

    if (leadsToContactCount > 0) {
      let message = '';
      const titles = Object.keys(detailsByTitle);

      // Construction d'un message résumé court
      if (titles.length === 1) {
        message = `${leadsToContactCount} leads pour "${titles[0]}"`;
      } else {
        message = titles.map((t) => `${t}: ${detailsByTitle[t]}`).join(', ');
      }

      createNotificationSafe({
        title: `Rappel : ${leadsToContactCount} leads à relancer`,
        message: message,
        priority: 2,
        tag: 'daily-reminder'
      });
    }
  });
}

/**
 * Clic sur la notification : ouvrir le dashboard avec filtre
 */
chrome.notifications.onClicked.addListener(() => {
  const optionsUrl = chrome.runtime.getURL('options.html') + '?filter=to_contact';
  chrome.tabs.create({ url: optionsUrl });
});

/**
 * Gestion des messages pour afficher le badge
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SHOW_BADGE') {
    chrome.action.setBadgeText({ text: request.text || '1' });
    chrome.action.setBadgeBackgroundColor({ color: '#0a66c2' });
  }
  if (request.type === 'SHOW_NOTIFICATION') {
    createNotificationSafe({
      title: request.title || 'LeadTracker',
      message: request.message || '',
      priority: request.priority || 1,
      tag: request.tag || ''
    });
    return false;
  }
  if (request.type === 'HARMONIZE_LEADS') {
    rationalizeTitlesAndLeads()
      .then(() => sendResponse && sendResponse({ ok: true }))
      .catch(() => sendResponse && sendResponse({ ok: false }));
    return true; // async
  }
  if (request.type === 'PUSH_SUPABASE') {
    console.log('[LeadTracker] 📨 Message PUSH_SUPABASE reçu:', {
      leadsCount: request.leads?.length || 0,
      titlesCount: request.searchTitles?.length || 0,
      eventsCount: request.events?.length || 0,
      timestamp: new Date().toISOString()
    });
    
    pushToSupabase(request.leads || [], request.searchTitles || [], request.events || [])
      .then(() => {
        console.log('[LeadTracker] ✅ pushToSupabase terminé avec succès');
        if (sendResponse) sendResponse({ ok: true });
      })
      .catch((e) => {
        console.error('[LeadTracker] ❌ PUSH_SUPABASE failed:', {
          error: e,
          message: e?.message,
          stack: e?.stack
        });
        if (sendResponse) sendResponse({ ok: false, error: e?.message || 'Unknown error' });
      });
    return true; // Indique qu'on répondra de manière asynchrone
  }
  return false;
});
