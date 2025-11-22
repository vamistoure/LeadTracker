// Helpers
const getById = (id) => document.getElementById(id);

const showView = (id) => {
  document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
  const view = getById(id);
  if (view) view.classList.remove('hidden');
};

const getTodayDate = () => new Date().toISOString().split('T')[0];

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

// State global
let currentContext = null;
let existingLeadId = null; // ID du lead existant si on est en mode mise à jour
let isFromConnectButton = false; // Flag pour indiquer si le contexte vient d'un clic sur Connect

document.addEventListener('DOMContentLoaded', async () => {
  showView('loading');

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
    console.error("[LeadTracker] Erreur onglet:", error);
    showView('view-other');
    showGlobalFeedback("Erreur lors de la récupération de l'onglet. Réessayez.", 'error');
    return;
  }
  
  if (!tab.url.includes("linkedin.com")) {
    showView('view-other');
    showGlobalFeedback("Ouvrez une recherche LinkedIn ou un profil pour utiliser l'extension.", 'info');
    setupEventListeners();
    return;
  }

  // Vérifier s'il y a un lead en attente (depuis un clic sur "Connect")
  const storage = await chrome.storage.local.get(['pendingLead']);
  const pendingLead = storage.pendingLead;
  
  // Si on a un lead en attente, utiliser ces infos (peu importe la page actuelle)
  if (pendingLead) {
    const isOnPendingProfile = tab.url.includes(pendingLead.url.split('/in/')[1]?.split('/')[0] || '');
    
    if (tab.url.includes("/search/results/people") || !isOnPendingProfile) {
      isFromConnectButton = true;
      const context = {
        contextType: "profile",
        searchKeyword: null,
        profileName: pendingLead.name,
        profileHeadline: pendingLead.headline || "",
        profileUrl: pendingLead.url
      };
      
      await chrome.storage.local.remove(['pendingLead']);
      chrome.action.setBadgeText({ text: "" });
      
      handleContext(context);
      setupEventListeners();
      return;
    }
  }
  
  // Comportement normal : demander le contexte au content script
  try {
    if (!tab || !tab.id) {
      throw new Error("Onglet invalide");
    }
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTEXT" });
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
          showGlobalFeedback("Contexte non détecté. Rafraîchissez la page LinkedIn.", 'warning');
        }
      } else {
        showView('view-other');
        showGlobalFeedback("Contexte non détecté. Rafraîchissez la page LinkedIn.", 'warning');
      }
    }
  } catch (error) {
    console.error("[LeadTracker] Erreur communication content script:", error);
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
    showGlobalFeedback("Extension inactive sur cette page. Rafraîchissez la page LinkedIn.", 'warning');
  }

  setupEventListeners();
});

async function safeGetContext(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "GET_PAGE_CONTEXT" });
  } catch (e) {
    console.warn("[LeadTracker] safeGetContext failed:", e);
    return null;
  }
}

async function tryInjectContentScript(tabId) {
  if (!chrome.scripting || !chrome.scripting.executeScript) {
    console.warn("[LeadTracker] chrome.scripting non disponible.");
    return false;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['contentScript.js']
    });
    console.log("[LeadTracker] Content script réinjecté via scripting API.");
    return true;
  } catch (e) {
    console.warn("[LeadTracker] Injection content script échouée:", e);
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
  }
}

// --- Vue Recherche ---
function initSearchView(context) {
  showView('view-search');
  showGlobalFeedback("", "info");
  const input = getById('searchTitleInput');
  if (context.searchKeyword) {
    input.value = context.searchKeyword;
  }
}

// --- Vue Profil ---
async function initProfileView(context) {
  showView('view-profile');
  
  // Remplir infos statiques
  const profileName = context.profileName || "Inconnu";
  getById('leadName').value = profileName;
  getById('leadHeadline').value = context.profileHeadline || "";
  getById('leadUrl').value = context.profileUrl || "";
  
  if (profileName === "Inconnu" && context.profileUrl && context.profileUrl.includes("/in/")) {
    showFeedback('leadFeedback', 'Nom non détecté. Rafraîchissez la page si besoin.', 'warning');
  }
  
  const storage = await chrome.storage.local.get(['leads', 'searchTitles']);
  const leads = storage.leads || [];
  const existingLead = leads.find(l => l.profileUrl === context.profileUrl);
  
  // Charger les titres de recherche
  const titles = storage.searchTitles || [];
  
  const select = getById('searchTitleSelect');
  select.innerHTML = '<option value="" disabled selected>Choisir...</option>';
  
  titles.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.label;
    opt.textContent = t.label;
    select.appendChild(opt);
  });

  // Option "Autre"
  const otherOpt = document.createElement('option');
  otherOpt.value = "__custom__";
  otherOpt.textContent = "Autre (Nouveau)...";
  select.appendChild(otherOpt);

  const emptyHint = getById('emptyTitlesHint');
  if (emptyHint) {
    if (titles.length === 0) emptyHint.classList.remove('hidden');
    else emptyHint.classList.add('hidden');
  }

  if (existingLead) {
    existingLeadId = existingLead.id;
    
    select.value = existingLead.searchTitle;
    if (!titles.some(t => t.label === existingLead.searchTitle)) {
      select.value = '__custom__';
      getById('customTitleInput').value = existingLead.searchTitle;
      getById('customTitleInput').classList.remove('hidden');
    }
    
    const connectionRadio = document.querySelector(`input[name="connectionType"][value="${existingLead.direction}"]`);
    if (connectionRadio) connectionRadio.checked = true;
    
    if (existingLead.requestDate) {
      getById('requestDate').value = existingLead.requestDate;
    } else {
      getById('requestDate').value = getTodayDate();
    }
    
    if (existingLead.acceptanceDate) {
      getById('acceptanceDate').value = existingLead.acceptanceDate;
      getById('acceptanceDateRequired').style.display = 'inline';
    } else {
      getById('acceptanceDate').value = '';
      getById('acceptanceDateRequired').style.display = 'none';
    }
    
    getById('isContacted').checked = existingLead.contacted || false;
    
    showFeedback('leadFeedback', 'Lead déjà enregistré. Mettez à jour si besoin.', 'info');
  } else {
    existingLeadId = null;
    getById('requestDate').value = getTodayDate();
    getById('acceptanceDate').value = '';
    getById('acceptanceDateRequired').style.display = 'none';
    getById('isContacted').checked = false;
    
    if (isFromConnectButton) {
      showFeedback('leadFeedback', 'Profil détecté après votre clic sur \"Connect\". Complétez puis enregistrez.', 'info');
      isFromConnectButton = false;
    } else {
      showFeedback('leadFeedback', 'Après avoir envoyé une demande, enregistrez le lead ici.', 'info');
    }
  }
}

// --- Event Listeners ---
function setupEventListeners() {
  // Bouton Dashboard
  ['btnOpenDashboard', 'btnOpenDashboardAlt'].forEach(id => {
    const btn = getById(id);
    if (btn) {
      btn.addEventListener('click', () => chrome.runtime.openOptionsPage());
    }
  });

  // -- RECHERCHE : Save --
  const btnSaveSearch = getById('btnSaveSearch');
  if (btnSaveSearch) {
    btnSaveSearch.addEventListener('click', async () => {
      const label = getById('searchTitleInput').value.trim();
      if (!label) {
        showFeedback('searchFeedback', 'Veuillez saisir un titre de recherche.', 'error');
        return;
      }

      setButtonLoading('btnSaveSearch', true);
      showFeedback('searchFeedback', 'Enregistrement en cours...', 'info');

      try {
        const storage = await chrome.storage.local.get(['searchTitles']);
        let titles = storage.searchTitles || [];

        const exists = titles.some(t => t.label.toLowerCase() === label.toLowerCase());
        
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
          showFeedback('searchFeedback', 'Ce titre existe déjà. Vous pouvez l\'utiliser pour vos leads.', 'info');
          
          setTimeout(() => window.close(), 2000);
        }
      } catch (error) {
        setButtonLoading('btnSaveSearch', false);
        showFeedback('searchFeedback', 'Erreur lors de l\'enregistrement.', 'error');
        console.error('Erreur sauvegarde titre:', error);
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
  
  connectionRadios.forEach(radio => {
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
      let searchTitle = select.value;
      if (searchTitle === '__custom__') {
        searchTitle = customInput.value.trim();
      }

      const connectionType = document.querySelector('input[name="connectionType"]:checked').value;
      const acceptanceDate = getById('acceptanceDate').value || null;
      const requestDate = getById('requestDate').value || null;
      const isContacted = getById('isContacted').checked;

      if (!searchTitle || searchTitle === "") {
        showFeedback('leadFeedback', 'Le titre de recherche est obligatoire.', 'error');
        return;
      }
      if (connectionType !== 'outbound_pending' && !acceptanceDate) {
        showFeedback('leadFeedback', 'La date d\'acceptation est requise pour une connexion acceptée.', 'error');
        return;
      }

      setButtonLoading('btnSaveLead', true);
      showFeedback('leadFeedback', 'Enregistrement en cours...', 'info');

      try {
        if (select.value === '__custom__') {
          const storageTitles = await chrome.storage.local.get(['searchTitles']);
          let titles = storageTitles.searchTitles || [];
          const exists = titles.some(t => t.label.toLowerCase() === searchTitle.toLowerCase());
          if (!exists) {
            titles.push({
              id: Date.now() + '_custom',
              label: searchTitle,
              createdAt: Date.now()
            });
            await chrome.storage.local.set({ searchTitles: titles });
          }
        }

        const storageLeads = await chrome.storage.local.get(['leads']);
        let leads = storageLeads.leads || [];

        let targetIndex = -1;
        if (existingLeadId) {
          targetIndex = leads.findIndex(l => l.id === existingLeadId);
        }
        const profileUrl = getById('leadUrl').value;
        if (targetIndex === -1) {
          targetIndex = leads.findIndex(l => {
            if (connectionType === 'outbound_pending' && l.direction === 'outbound_pending') {
              return l.profileUrl === profileUrl;
            } else if (connectionType !== 'outbound_pending') {
              return l.profileUrl === profileUrl && l.acceptanceDate === acceptanceDate;
            }
            return false;
          });
        }

        const targetLead = targetIndex !== -1 ? leads[targetIndex] : null;
        const contactedDate = isContacted ? (targetLead?.contactedDate || getTodayDate()) : null;

        const leadData = {
          name: getById('leadName').value,
          headline: getById('leadHeadline').value,
          profileUrl: profileUrl,
          searchTitle: searchTitle,
          direction: connectionType,
          requestDate: requestDate,
          acceptanceDate: acceptanceDate,
          contacted: isContacted,
          contactedDate: contactedDate
        };

        if (targetIndex !== -1) {
          leads[targetIndex] = { 
            ...leads[targetIndex], 
            ...leadData,
            id: leads[targetIndex].id,
            createdAt: leads[targetIndex].createdAt
          };
          await chrome.storage.local.set({ leads: leads });
          
          setButtonLoading('btnSaveLead', false);
          showFeedback('leadFeedback', 'Lead mis à jour.', 'success');
          
          setTimeout(() => window.close(), 1500);
        } else {
          const newLead = {
            ...leadData,
            id: Date.now() + '_' + Math.random().toString(36).slice(2),
            createdAt: Date.now()
          };
          leads.push(newLead);
          await chrome.storage.local.set({ leads: leads });
          
          setButtonLoading('btnSaveLead', false);
          showFeedback('leadFeedback', 'Lead enregistré.', 'success');
          
          setTimeout(() => window.close(), 1500);
        }
      } catch (error) {
        setButtonLoading('btnSaveLead', false);
        showFeedback('leadFeedback', 'Erreur lors de l\'enregistrement.', 'error');
        console.error('Erreur sauvegarde lead:', error);
      }
    });
  }
}
