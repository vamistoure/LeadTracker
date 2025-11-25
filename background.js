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

function normalizeTitle(label = '') {
  return label.trim().toUpperCase();
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

async function harmonizeLeadsTitles() {
  try {
    const { leads = [], searchTitles = [] } = await chrome.storage.local.get([
      'leads',
      'searchTitles'
    ]);
    if (!leads.length || !searchTitles.length) return;

    const canonicalByNorm = new Map();
    searchTitles.forEach((t) => {
      const norm = normalizeTitle(t.label || '');
      if (!norm) return;
      if (!canonicalByNorm.has(norm)) {
        canonicalByNorm.set(norm, t.label);
      }
    });

    let changed = false;
    const now = Date.now();
    const updatedLeads = leads.map((l) => {
      const norm = normalizeTitle(l.searchTitle || '');
      const canonical = canonicalByNorm.get(norm);
      if (canonical && l.searchTitle !== canonical) {
        changed = true;
        return {
          ...l,
          searchTitle: canonical,
          updatedAt: now
        };
      }
      return l;
    });

    if (changed) {
      await chrome.storage.local.set({ leads: updatedLeads });
      console.log('[LeadTracker] Harmonisation des titres appliquée.');
    }
  } catch (e) {
    console.warn('[LeadTracker] Harmonisation échouée:', e);
  }
}

/**
 * Initialisation de l'alarme quotidienne
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installée. Création de l'alarme quotidienne.");
  // Vérification quotidienne (toutes les 1440 minutes = 24h)
  chrome.alarms.create('daily-check', { periodInMinutes: 1440 });
  seedDefaultTitles().then(harmonizeLeadsTitles);
});

chrome.runtime.onStartup.addListener(() => {
  seedDefaultTitles().then(harmonizeLeadsTitles);
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
    harmonizeLeadsTitles()
      .then(() => sendResponse && sendResponse({ ok: true }))
      .catch(() => sendResponse && sendResponse({ ok: false }));
    return true; // async
  }
  return false;
});
