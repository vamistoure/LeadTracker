// Helpers
const getById = (id) => document.getElementById(id);

const showView = (id) => {
  document.querySelectorAll('.view').forEach((el) => el.classList.add('hidden'));
  const view = getById(id);
  if (view) view.classList.remove('hidden');
};

function setContextBadge(label = '', tone = 'info') {
  const badge = getById('contextBadge');
  if (!badge) return;
  badge.textContent = label || '';
  badge.className = 'context-badge';
  if (!label) {
    badge.classList.add('hidden');
    return;
  }
  badge.classList.remove('hidden');
  badge.classList.add(`tone-${tone}`);
}

const getTodayDate = () => new Date().toISOString().split('T')[0];
const formatTitle = (label = '') =>
  window?.formatTitle ? window.formatTitle(label) : (label || '').trim().toUpperCase();
const canonicalizeTitle = (label, titles = []) => {
  const norm = formatTitle(label || '');
  if (!norm) return '';
  const map = new Map();
  titles.forEach((t) => {
    const n = formatTitle(t.label || '');
    if (n && !map.has(n)) {
      map.set(n, t.label);
    }
  });
  return map.get(norm) || norm;
};
const formatDisplayDate = (dateString) => dateString || '–';
function getDaysDiff(dateString) {
  if (!dateString) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateString);
  d.setHours(0, 0, 0, 0);
  return Math.floor((today - d) / (1000 * 60 * 60 * 24));
}

function showFeedback(elementId, message, type = 'info') {
  const feedback = getById(elementId);
  if (!feedback) return;

  feedback.classList.remove('hidden', 'success', 'error', 'warning', 'info');
  feedback.classList.add(type);
  feedback.textContent = message;

  if (!message) {
    feedback.classList.add('hidden');
  }

  if (type === 'success') {
    setTimeout(() => feedback.classList.add('hidden'), 2500);
  }
}

function computeExistingState(lead) {
  if (!lead.acceptanceDate) return 'pending';
  if (!lead.contacted) return 'to_contact';
  return 'contacted';
}

function configureExistingButtons(lead, state) {
  const statusEl = getById('existingStatus');
  const messageEl = getById('existingMessage');
  const primaryBtn = getById('btnExistingPrimary');
  const secondaryBtn = getById('btnExistingSecondary');
  if (!statusEl || !messageEl || !primaryBtn || !secondaryBtn) return;

  statusEl.className = 'status-badge';
  secondaryBtn.classList.add('hidden');
  secondaryBtn.textContent = '';

  if (state === 'pending') {
    statusEl.classList.add('pending');
    statusEl.textContent = 'En attente';
    messageEl.textContent = `Demande envoyée le ${formatDisplayDate(lead.requestDate)} – en attente d’acceptation.`;
    primaryBtn.textContent = 'Ils ont accepté ma demande';
    return;
  }

  if (state === 'to_contact') {
    statusEl.classList.add('to-contact');
    statusEl.textContent = 'À contacter';
    const days = getDaysDiff(lead.acceptanceDate);
    const dayText = days !== null ? ` (J+${days})` : '';
    messageEl.textContent = `Connexion acceptée le ${formatDisplayDate(lead.acceptanceDate)}${dayText}. Tu n’as pas encore contacté ce lead.`;
    primaryBtn.textContent = 'Marquer comme contacté aujourd’hui';
    return;
  }

  statusEl.classList.add('contacted');
  statusEl.textContent = 'Contacté';
  messageEl.textContent = `Lead contacté le ${formatDisplayDate(lead.contactedDate)}.`;
  primaryBtn.textContent = 'Mettre à jour la date de contact';
  secondaryBtn.textContent = 'Marquer comme non contacté';
  secondaryBtn.classList.remove('hidden');
}

function formatDirection(direction) {
  if (direction === 'outbound_pending') return 'Demande envoyée (en attente)';
  if (direction === 'outbound_accepted') return 'Outbound (acceptée)';
  if (direction === 'inbound_accepted') return 'Inbound (reçue)';
  return direction || 'Inconnu';
}

async function updateExistingLead(updates) {
  try {
    const storage = await chrome.storage.local.get(['leads']);
    let leads = storage.leads || [];
    const idx = leads.findIndex((l) => l.id === currentExistingLead?.id);
    if (idx === -1) return;
    leads[idx] = {
      ...leads[idx],
      ...updates,
      updatedAt: Date.now()
    };
    await chrome.storage.local.set({ leads });
    currentExistingLead = leads[idx];
    renderExistingLead(currentExistingLead);
  } catch (e) {
    console.error('[LeadTracker] Erreur mise à jour lead existant:', e);
  }
}

function renderExistingLead(lead) {
  if (!lead) return;
  currentExistingLead = lead;
  currentExistingState = computeExistingState(lead);
  showView('view-existing');
  setContextBadge('Lead déjà enregistré', 'success');

  getById('existingName').textContent = lead.name || 'Inconnu';
  getById('existingHeadline').textContent = lead.headline || '';
  getById('existingCompany').textContent = lead.company || '–';
  getById('existingSearchTitle').textContent = lead.searchTitle || '–';
  getById('existingDirection').textContent = formatDirection(lead.direction);
  getById('existingRequestDate').textContent = formatDisplayDate(lead.requestDate);
  getById('existingAcceptanceDate').textContent = formatDisplayDate(lead.acceptanceDate);
  getById('existingContactDate').textContent = formatDisplayDate(lead.contactedDate);

  configureExistingButtons(lead, currentExistingState);
}

const showGlobalFeedback = (message, type = 'info') => {
  showFeedback('popupFeedback', message, type);
};

// Helper pour gérer l'état du bouton (loading/disabled)
function setButtonLoading(buttonId, isLoading) {
  const button = getById(buttonId);
  if (!button) return;

  const textSpan = getById(buttonId + 'Text');
  const loaderSpan = getById(buttonId + 'Loader');

  if (isLoading) {
    button.disabled = true;
    if (textSpan) textSpan.style.opacity = '0.6';
    if (loaderSpan) loaderSpan.classList.remove('hidden');
  } else {
    button.disabled = false;
    if (textSpan) textSpan.style.opacity = '1';
    if (loaderSpan) loaderSpan.classList.add('hidden');
  }
}

function getDashboardUrl(params = {}) {
  const baseUrl = chrome.runtime.getURL ? chrome.runtime.getURL('options.html') : 'options.html';
  const search = new URLSearchParams();
  if (params.leadId) search.set('leadId', params.leadId);
  if (params.profileUrl) search.set('profileUrl', params.profileUrl);
  const query = search.toString();
  return query ? `${baseUrl}?${query}` : baseUrl;
}

function openDashboard(params = {}) {
  const targetUrl = getDashboardUrl(params);
  if (chrome.tabs?.create) {
    chrome.tabs.create({ url: targetUrl });
    return;
  }
  if (!params.leadId && !params.profileUrl && chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  }
}

// State global
let currentContext = null;
let existingLeadId = null; // ID du lead existant si on est en mode mise à jour
let isFromConnectButton = false; // Flag pour indiquer si le contexte vient d'un clic sur Connect
let currentExistingLead = null;
let currentExistingState = null;

function harmonizeLeads() {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'HARMONIZE_LEADS' }, () => resolve());
    } catch (e) {
      console.warn('[LeadTracker] Harmonize leads failed:', e);
      resolve();
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await harmonizeLeads();
  showView('loading');
  setContextBadge('Analyse de la page...', 'info');

  // Obtenir l'onglet actif
  let tab;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
    if (!tab || !tab.url) {
      showView('view-other');
      showGlobalFeedback("Impossible de récupérer l'onglet actif. Réessayez.", 'error');
      return;
    }
  } catch (error) {
    console.error('[LeadTracker] Erreur onglet:', error);
    showView('view-other');
    setContextBadge('Extension inactive', 'warning');
    showGlobalFeedback("Erreur lors de la récupération de l'onglet. Réessayez.", 'error');
    return;
  }

  if (!tab.url.includes('linkedin.com')) {
    showView('view-other');
    setContextBadge('Hors LinkedIn', 'warning');
    showGlobalFeedback(
      "Ouvrez une recherche LinkedIn ou un profil pour utiliser l'extension.",
      'info'
    );
    setupEventListeners();
    return;
  }

  // Vérifier s'il y a un lead en attente (depuis un clic sur "Connect")
  const storage = await chrome.storage.local.get(['pendingLead']);
  const pendingLead = storage.pendingLead;

  // Si on a un lead en attente, utiliser ces infos (peu importe la page actuelle)
  if (pendingLead) {
    const isOnPendingProfile = tab.url.includes(
      pendingLead.url.split('/in/')[1]?.split('/')[0] || ''
    );

    if (tab.url.includes('/search/results/people') || !isOnPendingProfile) {
      isFromConnectButton = true;
      const context = {
        contextType: 'profile',
        searchKeyword: null,
        profileName: pendingLead.name,
        profileHeadline: pendingLead.headline || '',
        profileUrl: pendingLead.url
      };

      await chrome.storage.local.remove(['pendingLead']);
      chrome.action.setBadgeText({ text: '' });

      handleContext(context);
      setupEventListeners();
      return;
    }
  }

  // Comportement normal : demander le contexte au content script
  try {
    if (!tab || !tab.id) {
      throw new Error('Onglet invalide');
    }
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' });
    if (response) {
      handleContext(response);
    } else {
      const injected = await tryInjectContentScript(tab.id);
      if (injected) {
        const retry = await safeGetContext(tab.id);
        if (retry) {
          handleContext(retry);
        } else {
          showView('view-other');
          setContextBadge('Contexte non détecté', 'warning');
          showGlobalFeedback('Contexte non détecté. Rafraîchissez la page LinkedIn.', 'warning');
        }
      } else {
        showView('view-other');
        setContextBadge('Contexte non détecté', 'warning');
        showGlobalFeedback('Contexte non détecté. Rafraîchissez la page LinkedIn.', 'warning');
      }
    }
  } catch (error) {
    console.error('[LeadTracker] Erreur communication content script:', error);
    const injected = tab?.id ? await tryInjectContentScript(tab.id) : false;
    if (injected) {
      const retry = await safeGetContext(tab.id);
      if (retry) {
        handleContext(retry);
        setupEventListeners();
        return;
      }
    }
    showView('view-other');
    setContextBadge('Extension inactive', 'warning');
    showGlobalFeedback(
      'Extension inactive sur cette page. Rafraîchissez la page LinkedIn.',
      'warning'
    );
  }

  setupEventListeners();
});

async function safeGetContext(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTEXT' });
  } catch (e) {
    console.warn('[LeadTracker] safeGetContext failed:', e);
    return null;
  }
}

async function tryInjectContentScript(tabId) {
  if (!chrome.scripting || !chrome.scripting.executeScript) {
    console.warn('[LeadTracker] chrome.scripting non disponible.');
    showGlobalFeedback(
      'Extension inactive sur cette page. Rafraîchissez la page LinkedIn.',
      'warning'
    );
    return false;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['contentScript.js']
    });
    console.log('[LeadTracker] Content script réinjecté via scripting API.');
    return true;
  } catch (e) {
    console.warn('[LeadTracker] Injection content script échouée:', e);
    return false;
  }
}

function handleContext(context) {
  currentContext = context;

  if (context.contextType === 'search') {
    initSearchView(context);
  } else if (context.contextType === 'profile') {
    initProfileView(context);
  } else {
    showView('view-other');
    setContextBadge('Hors LinkedIn', 'warning');
  }
}

// --- Vue Recherche ---
function initSearchView(context) {
  showView('view-search');
  setContextBadge('Recherche LinkedIn détectée', 'info');
  showGlobalFeedback('', 'info');
  const input = getById('searchTitleInput');
  if (context.searchKeyword) {
    input.value = context.searchKeyword;
  }
}

// --- Vue Profil ---
async function initProfileView(context) {
  showView('view-profile');
  setContextBadge('Profil LinkedIn détecté', 'info');

  // Remplir infos statiques
  const profileName = context.profileName || 'Inconnu';
  getById('leadName').value = profileName;
  getById('leadHeadline').value = context.profileHeadline || '';
  getById('leadCompany').value = context.profileCompany || '';
  getById('leadUrl').value = context.profileUrl || '';

  if (profileName === 'Inconnu' && context.profileUrl && context.profileUrl.includes('/in/')) {
    showFeedback('leadFeedback', 'Nom non détecté. Rafraîchissez la page si besoin.', 'warning');
  }

  const storage = await chrome.storage.local.get(['leads', 'searchTitles']);
  const leads = storage.leads || [];
  const existingLead = leads.find((l) => l.profileUrl === context.profileUrl);

  // Charger les titres de recherche
  const titles = (storage.searchTitles || [])
    .map((t) => ({
      ...t,
      formattedLabel: formatTitle(t.label || '')
    }))
    .sort((a, b) => a.formattedLabel.localeCompare(b.formattedLabel));

  const select = getById('searchTitleSelect');
  select.innerHTML = '<option value="" disabled selected>Choisir...</option>';

  titles.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.label;
    opt.textContent = t.formattedLabel || t.label;
    select.appendChild(opt);
  });

  // Option "Autre"
  const otherOpt = document.createElement('option');
  otherOpt.value = '__custom__';
  otherOpt.textContent = 'Autre (Nouveau)...';
  select.appendChild(otherOpt);

  const emptyHint = getById('emptyTitlesHint');
  if (emptyHint) {
    if (titles.length === 0) emptyHint.classList.remove('hidden');
    else emptyHint.classList.add('hidden');
  }

  if (existingLead) {
    existingLeadId = existingLead.id;
    currentExistingLead = existingLead;
    setContextBadge('Lead déjà enregistré', 'success');
    renderExistingLead(existingLead);
    return;
  } else {
    existingLeadId = null;
    getById('requestDate').value = getTodayDate();
    getById('acceptanceDate').value = '';
    getById('acceptanceDateRequired').style.display = 'none';
    getById('isContacted').checked = false;
    const topLeadCheckbox = getById('isTopLead');
    if (topLeadCheckbox) topLeadCheckbox.checked = false;

    if (isFromConnectButton) {
      showFeedback(
        'leadFeedback',
        'Profil détecté après votre clic sur \"Connect\". Complétez puis enregistrez.',
        'info'
      );
      isFromConnectButton = false;
    } else {
      showFeedback(
        'leadFeedback',
        'Après avoir envoyé une demande, enregistrez le lead ici.',
        'info'
      );
    }
  }
}

// --- Event Listeners ---
function setupEventListeners() {
  // Bouton Dashboard
  ['btnOpenDashboard', 'btnOpenDashboardAlt'].forEach((id) => {
    const btn = getById(id);
    if (btn) {
      btn.addEventListener('click', () => openDashboard());
    }
  });
  const btnExistingDashboard = getById('btnExistingDashboard');
  if (btnExistingDashboard) {
    btnExistingDashboard.addEventListener('click', () => {
      if (currentExistingLead) {
        openDashboard({
          leadId: currentExistingLead.id,
          profileUrl: currentExistingLead.profileUrl
        });
      } else {
        openDashboard();
      }
    });
  }

  // -- RECHERCHE : Save --
  const btnSaveSearch = getById('btnSaveSearch');
  if (btnSaveSearch) {
    btnSaveSearch.addEventListener('click', async () => {
      const rawLabel = getById('searchTitleInput').value.trim();
      const label = formatTitle(rawLabel);
      if (!label) {
        showFeedback('searchFeedback', 'Veuillez saisir un titre de recherche.', 'error');
        return;
      }

      setButtonLoading('btnSaveSearch', true);
      showFeedback('searchFeedback', 'Enregistrement en cours...', 'info');

      try {
        const storage = await chrome.storage.local.get(['searchTitles']);
        let titles = storage.searchTitles || [];

        const exists = titles.some((t) => t.label.toLowerCase() === label.toLowerCase());

        if (!exists) {
          titles.push({
            id: Date.now() + '_' + Math.random().toString(36).slice(2),
            label: label,
            createdAt: Date.now()
          });
          await chrome.storage.local.set({ searchTitles: titles });

          setButtonLoading('btnSaveSearch', false);
          showFeedback('searchFeedback', 'Titre enregistré.', 'success');

          setTimeout(() => window.close(), 1500);
        } else {
          setButtonLoading('btnSaveSearch', false);
          showFeedback(
            'searchFeedback',
            "Ce titre existe déjà. Vous pouvez l'utiliser pour vos leads.",
            'info'
          );

          setTimeout(() => window.close(), 2000);
        }
      } catch (error) {
        setButtonLoading('btnSaveSearch', false);
        showFeedback('searchFeedback', "Erreur lors de l'enregistrement.", 'error');
        console.error('Erreur sauvegarde titre:', error);
      }
    });
  }

  const btnExistingPrimary = getById('btnExistingPrimary');
  if (btnExistingPrimary) {
    btnExistingPrimary.addEventListener('click', async () => {
      if (!currentExistingLead) return;
      const state = computeExistingState(currentExistingLead);
      if (state === 'pending') {
        await updateExistingLead({
          acceptanceDate: getTodayDate(),
          direction:
            currentExistingLead.direction === 'outbound_pending'
              ? 'outbound_accepted'
              : currentExistingLead.direction
        });
      } else if (state === 'to_contact') {
        await updateExistingLead({
          contacted: true,
          contactedDate: getTodayDate()
        });
      } else if (state === 'contacted') {
        await updateExistingLead({
          contacted: true,
          contactedDate: getTodayDate()
        });
      }
    });
  }

  const btnExistingSecondary = getById('btnExistingSecondary');
  if (btnExistingSecondary) {
    btnExistingSecondary.addEventListener('click', async () => {
      if (!currentExistingLead) return;
      const state = computeExistingState(currentExistingLead);
      if (state === 'contacted') {
        await updateExistingLead({
          contacted: false,
          contactedDate: null
        });
      }
    });
  }

  // -- PROFIL : Select Change --
  const select = getById('searchTitleSelect');
  const customInput = getById('customTitleInput');

  if (select) {
    select.addEventListener('change', (e) => {
      if (e.target.value === '__custom__') {
        customInput.classList.remove('hidden');
        customInput.focus();
      } else {
        customInput.classList.add('hidden');
      }
    });
  }

  // -- PROFIL : Connection Type Change (gérer date acceptation selon le type) --
  const connectionRadios = document.querySelectorAll('input[name="connectionType"]');
  const acceptanceDateInput = getById('acceptanceDate');
  const acceptanceDateRequired = getById('acceptanceDateRequired');
  const requestDateInput = getById('requestDate');

  connectionRadios.forEach((radio) => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'outbound_pending') {
        acceptanceDateInput.removeAttribute('required');
        acceptanceDateRequired.style.display = 'none';
        acceptanceDateInput.value = '';
        if (!requestDateInput.value) {
          requestDateInput.value = getTodayDate();
        }
      } else {
        acceptanceDateInput.setAttribute('required', 'required');
        acceptanceDateRequired.style.display = 'inline';
        if (!acceptanceDateInput.value) {
          acceptanceDateInput.value = getTodayDate();
        }
      }
    });
  });

  // -- PROFIL : Cancel --
  const btnCancel = getById('btnCancel');
  if (btnCancel) btnCancel.addEventListener('click', () => window.close());

  // -- PROFIL : Save Lead --
  const btnSaveLead = getById('btnSaveLead');
  if (btnSaveLead) {
    btnSaveLead.addEventListener('click', async () => {
      const rawSelection = select.value;
      const rawTitle = rawSelection === '__custom__' ? customInput.value.trim() : rawSelection;
      const normalizedTitle = formatTitle(rawTitle);

      const connectionType = document.querySelector('input[name="connectionType"]:checked').value;
      const acceptanceDate = getById('acceptanceDate').value || null;
      const requestDate = getById('requestDate').value || null;
      const isContacted = getById('isContacted').checked;
      const isTopLead = getById('isTopLead')?.checked || false;

      if (!normalizedTitle || normalizedTitle === '') {
        showFeedback('leadFeedback', 'Le titre de recherche est obligatoire.', 'error');
        return;
      }
      if (connectionType !== 'outbound_pending' && !acceptanceDate) {
        showFeedback(
          'leadFeedback',
          "La date d'acceptation est requise pour une connexion acceptée.",
          'error'
        );
        return;
      }

      setButtonLoading('btnSaveLead', true);
      showFeedback('leadFeedback', 'Enregistrement en cours...', 'info');

      try {
        const storageTitles = await chrome.storage.local.get(['searchTitles']);
        let titles = storageTitles.searchTitles || [];
        const canonicalTitle = canonicalizeTitle(rawTitle, titles);

        if (rawSelection === '__custom__') {
          const exists = titles.some((t) => formatTitle(t.label) === normalizedTitle);
          if (!exists) {
            titles.push({
              id: Date.now() + '_custom',
              label: canonicalTitle,
              createdAt: Date.now()
            });
            await chrome.storage.local.set({ searchTitles: titles });
          }
        }

        const storageLeads = await chrome.storage.local.get(['leads']);
        let leads = storageLeads.leads || [];

        let targetIndex = -1;
        if (existingLeadId) {
          targetIndex = leads.findIndex((l) => l.id === existingLeadId);
        }
        const profileUrl = getById('leadUrl').value;
        if (targetIndex === -1) {
          targetIndex = leads.findIndex((l) => {
            if (connectionType === 'outbound_pending' && l.direction === 'outbound_pending') {
              return l.profileUrl === profileUrl;
            } else if (connectionType !== 'outbound_pending') {
              return l.profileUrl === profileUrl && l.acceptanceDate === acceptanceDate;
            }
            return false;
          });
        }

        const targetLead = targetIndex !== -1 ? leads[targetIndex] : null;
        const contactedDate = isContacted ? targetLead?.contactedDate || getTodayDate() : null;

        const leadData = {
          name: getById('leadName').value,
          headline: getById('leadHeadline').value,
          profileUrl: profileUrl,
          company: getById('leadCompany').value || '',
          searchTitle: canonicalTitle,
          direction: connectionType,
          requestDate: requestDate,
          acceptanceDate: acceptanceDate,
          contacted: isContacted,
          contactedDate: contactedDate,
          topLead: isTopLead
        };

        if (targetIndex !== -1) {
          leads[targetIndex] = {
            ...leads[targetIndex],
            ...leadData,
            id: leads[targetIndex].id,
            createdAt: leads[targetIndex].createdAt,
            updatedAt: Date.now()
          };
          await chrome.storage.local.set({ leads: leads });

          setButtonLoading('btnSaveLead', false);
          showFeedback('leadFeedback', 'Lead mis à jour.', 'success');

          setTimeout(() => window.close(), 1500);
        } else {
          const newLead = {
            ...leadData,
            id: Date.now() + '_' + Math.random().toString(36).slice(2),
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          leads.push(newLead);
          await chrome.storage.local.set({ leads: leads });

          setButtonLoading('btnSaveLead', false);
          showFeedback('leadFeedback', 'Lead enregistré.', 'success');

          setTimeout(() => window.close(), 1500);
        }
      } catch (error) {
        setButtonLoading('btnSaveLead', false);
        showFeedback('leadFeedback', "Erreur lors de l'enregistrement.", 'error');
        console.error('Erreur sauvegarde lead:', error);
      }
    });
  }
}
