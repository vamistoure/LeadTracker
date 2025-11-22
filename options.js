// Utilitaire dates
function getDaysDiff(dateString) {
  if (!dateString) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateString);
  d.setHours(0, 0, 0, 0);
  return Math.floor((today - d) / (1000 * 60 * 60 * 24));
}

// État global
let allLeads = [];
let allTitles = [];
let isLoading = true;

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  initFiltersFromUrl();
  renderFilters();
  renderTable();
  setupEventListeners();
});

function setFeedback(message, type = 'info') {
  const box = document.getElementById('optionsFeedback');
  if (!box) return;
  box.classList.remove('hidden', 'success', 'error', 'info');
  box.classList.add(type);
  box.textContent = message;
  if (!message) box.classList.add('hidden');
}

async function loadData() {
  try {
    const data = await chrome.storage.local.get(['leads', 'searchTitles']);
    allLeads = data.leads || [];
    allTitles = data.searchTitles || [];
  } catch (e) {
    console.error('Erreur chargement données:', e);
    setFeedback('Impossible de charger les données. Réessayez.', 'error');
  } finally {
    isLoading = false;
  }
}

function initFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('filter') === 'to_contact') {
    document.getElementById('filterToContact').checked = true;
    toggleFilterBadge(true);
  }
}

function toggleFilterBadge(isActive) {
  const badge = document.getElementById('filterBadge');
  if (!badge) return;
  if (isActive) badge.classList.remove('hidden');
  else badge.classList.add('hidden');
}

function renderFilters() {
  const select = document.getElementById('filterSearchTitle');
  if (!select) return;

  select.innerHTML = '<option value="all">Tous les titres</option>';
  
  const usedTitles = new Set(allLeads.map(l => l.searchTitle));
  allTitles.forEach(t => usedTitles.add(t.label));

  Array.from(usedTitles).sort().forEach(title => {
    const opt = document.createElement('option');
    opt.value = title;
    opt.textContent = title;
    select.appendChild(opt);
  });
}

function getFilteredLeads() {
  const searchTitle = document.getElementById('filterSearchTitle').value;
  const dateFrom = document.getElementById('filterDateFrom').value;
  const dateTo = document.getElementById('filterDateTo').value;
  const onlyToContact = document.getElementById('filterToContact').checked;

  toggleFilterBadge(onlyToContact);

  return allLeads.filter(lead => {
    if (searchTitle !== 'all' && lead.searchTitle !== searchTitle) return false;

    if (dateFrom && lead.acceptanceDate && lead.acceptanceDate < dateFrom) return false;
    if (dateTo && lead.acceptanceDate && lead.acceptanceDate > dateTo) return false;

    if (onlyToContact) {
      if (lead.contacted) return false;
      if (!lead.acceptanceDate) return false;
      const days = getDaysDiff(lead.acceptanceDate);
      if (days < 5 || days > 7) return false;
    }

    return true;
  });
}

function renderTable() {
  const tableWrapper = document.getElementById('tableWrapper');
  const tbody = document.querySelector('#leadsTable tbody');
  const emptyAll = document.getElementById('emptyAll');
  const emptyFiltered = document.getElementById('emptyFiltered');
  const loadingState = document.getElementById('loadingState');

  if (isLoading) {
    loadingState.classList.remove('hidden');
    tableWrapper.classList.add('hidden');
    emptyAll.classList.add('hidden');
    emptyFiltered.classList.add('hidden');
    return;
  } else {
    loadingState.classList.add('hidden');
  }

  const filtered = getFilteredLeads();

  if (allLeads.length === 0) {
    emptyAll.classList.remove('hidden');
    emptyFiltered.classList.add('hidden');
    tableWrapper.classList.add('hidden');
    return;
  } else {
    emptyAll.classList.add('hidden');
  }

  if (filtered.length === 0) {
    emptyFiltered.classList.remove('hidden');
    tableWrapper.classList.add('hidden');
    return;
  } else {
    emptyFiltered.classList.add('hidden');
    tableWrapper.classList.remove('hidden');
  }

  tbody.innerHTML = '';

  const getSortValue = (lead) => {
    if (lead.acceptanceDate) {
      const time = new Date(lead.acceptanceDate).getTime();
      if (!isNaN(time)) return time;
    }
    return -Infinity;
  };
  filtered.sort((a, b) => getSortValue(b) - getSortValue(a));

  filtered.forEach(lead => {
    const days = lead.acceptanceDate ? getDaysDiff(lead.acceptanceDate) : null;
    const tr = document.createElement('tr');
    
    if (lead.acceptanceDate && !lead.contacted && days >= 5 && days <= 7) {
      tr.classList.add('highlight-contact');
    }

    let statusText = '';
    if (lead.direction === 'outbound_pending') {
      statusText = 'En attente (demande envoyée)';
    } else if (lead.direction === 'outbound_accepted') {
      statusText = 'Outbound (acceptée)';
    } else if (lead.direction === 'inbound_accepted') {
      statusText = 'Inbound (reçue)';
    } else {
      statusText = lead.direction || 'Inconnu';
    }

    const daysText = days !== null ? `J+${days}` : '-';

    tr.innerHTML = `
      <td>
        <div class="profile-cell">
          <a href="${lead.profileUrl}" target="_blank" class="profile-name">${lead.name || 'Inconnu'}</a>
          <span class="profile-headline">${lead.headline ? (lead.headline.substring(0, 60) + (lead.headline.length > 60 ? '...' : '')) : ''}</span>
        </div>
      </td>
      <td>${lead.searchTitle}</td>
      <td>${statusText}</td>
      <td>${lead.requestDate || '-'}</td>
      <td>${lead.acceptanceDate || 'En attente'}</td>
      <td>${daysText}</td>
      <td><input type="checkbox" class="chk-contacted" data-id="${lead.id}" ${lead.contacted ? 'checked' : ''}></td>
      <td class="actions-cell">
        ${lead.direction === 'outbound_pending' ? 
          `<button class="btn-icon accept-lead" data-id="${lead.id}" title="Marquer comme accepté">Accepter</button>` : 
          ''
        }
        <button class="btn-icon delete-lead" data-id="${lead.id}" title="Supprimer">Supprimer</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('.chk-contacted').forEach(el => {
    el.addEventListener('change', handleContactChange);
  });
  document.querySelectorAll('.delete-lead').forEach(el => {
    el.addEventListener('click', handleDeleteLead);
  });
  document.querySelectorAll('.accept-lead').forEach(el => {
    el.addEventListener('click', handleAcceptLead);
  });
}

async function handleContactChange(e) {
  const id = e.target.dataset.id;
  const isChecked = e.target.checked;
  
  const index = allLeads.findIndex(l => l.id === id);
  if (index !== -1) {
    allLeads[index].contacted = isChecked;
    allLeads[index].contactedDate = isChecked ? (allLeads[index].contactedDate || new Date().toISOString().split('T')[0]) : allLeads[index].contactedDate;
    
    await chrome.storage.local.set({ leads: allLeads });
  }
}

async function handleAcceptLead(e) {
  const id = e.target.dataset.id;
  const lead = allLeads.find(l => l.id === id);
  
  if (!lead || lead.direction !== 'outbound_pending') {
    return;
  }
  
  lead.direction = 'outbound_accepted';
  lead.acceptanceDate = new Date().toISOString().split('T')[0];
  
  await chrome.storage.local.set({ leads: allLeads });
  renderTable();
  renderFilters();
}

async function handleDeleteLead(e) {
  if (!confirm("Supprimer ce lead ?")) return;
  
  const id = e.target.dataset.id;
  allLeads = allLeads.filter(l => l.id !== id);
  await chrome.storage.local.set({ leads: allLeads });
  setFeedback('Lead supprimé.', 'success');
  renderTable();
}

function setupEventListeners() {
  ['filterSearchTitle', 'filterDateFrom', 'filterDateTo', 'filterToContact'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      renderTable();
    });
  });

  document.getElementById('btnClear').addEventListener('click', async () => {
    if (confirm("Tout supprimer (leads et titres) ? Cette action est irréversible.")) {
      await chrome.storage.local.clear();
      allLeads = [];
      allTitles = [];
      setFeedback('Toutes les données ont été supprimées.', 'success');
      renderTable();
      renderFilters();
    }
  });

  document.getElementById('btnExport').addEventListener('click', () => {
    try {
      const filtered = getFilteredLeads();
      if (filtered.length === 0) {
        setFeedback('Aucun lead à exporter avec les filtres actuels.', 'info');
        return;
      }

      const headers = ["Nom", "Headline", "URL Profil", "Titre Recherche", "Type", "Date Demande", "Date Acceptation", "Jours depuis", "Contacté", "Date Contact", "Date Création"];
      
      const rows = filtered.map(l => {
        let statusText = '';
        if (l.direction === 'outbound_pending') {
          statusText = 'En attente (demande envoyée)';
        } else if (l.direction === 'outbound_accepted') {
          statusText = 'Outbound (acceptée)';
        } else if (l.direction === 'inbound_accepted') {
          statusText = 'Inbound (reçue)';
        } else {
          statusText = l.direction || 'Inconnu';
        }

        return [
          `"${(l.name || '').replace(/"/g, '""')}"`,
          `"${(l.headline || '').replace(/"/g, '""')}"`,
          l.profileUrl,
          `"${(l.searchTitle || '').replace(/"/g, '""')}"`,
          statusText,
          l.requestDate || '',
          l.acceptanceDate || 'En attente',
          l.acceptanceDate ? getDaysDiff(l.acceptanceDate) : '-',
          l.contacted ? 'Oui' : 'Non',
          l.contactedDate || '',
          new Date(l.createdAt).toLocaleDateString()
        ];
      });

      const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `linkedin_leads_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setFeedback('Fichier CSV généré.', 'success');
    } catch (error) {
      console.error('Erreur export CSV:', error);
      setFeedback('Erreur lors de la génération du CSV.', 'error');
    }
  });
}
