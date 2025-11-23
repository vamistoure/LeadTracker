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
let currentPage = 1;
const PAGE_SIZE = 10;
let currentSortColumn = 'createdAt';
let currentSortDir = 'desc';
const formatTitle = (label = '') => (label || '').trim().toUpperCase();
const normalizeTitle = (label = '') => (label || '').trim().toUpperCase();

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
  
  const usedMap = new Map();
  allLeads.forEach(l => {
    const norm = normalizeTitle(l.searchTitle);
    if (norm) usedMap.set(norm, formatTitle(norm));
  });
  allTitles.forEach(t => {
    const norm = normalizeTitle(t.label);
    if (norm) usedMap.set(norm, formatTitle(norm));
  });

  Array.from(usedMap.entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([value, label]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      select.appendChild(opt);
    });
}

function getFilteredLeads() {
  const searchTitle = document.getElementById('filterSearchTitle').value;
  const dateFrom = document.getElementById('filterDateFrom').value;
  const dateTo = document.getElementById('filterDateTo').value;
  const onlyToContact = document.getElementById('filterToContact').checked;
  const keyword = (document.getElementById('filterKeyword').value || '').toLowerCase().trim();

  toggleFilterBadge(onlyToContact);

  return allLeads.filter(lead => {
    if (searchTitle !== 'all' && normalizeTitle(lead.searchTitle) !== searchTitle) return false;

    if (dateFrom && lead.acceptanceDate && lead.acceptanceDate < dateFrom) return false;
    if (dateTo && lead.acceptanceDate && lead.acceptanceDate > dateTo) return false;

    if (onlyToContact) {
      if (lead.contacted) return false;
      if (!lead.acceptanceDate) return false;
      const days = getDaysDiff(lead.acceptanceDate);
      if (days < 5 || days > 7) return false;
    }

    if (keyword) {
      const haystack = [
        lead.name || '',
        lead.headline || '',
        lead.searchTitle || ''
      ].join(' ').toLowerCase();
      if (!haystack.includes(keyword)) return false;
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
  const pagination = document.getElementById('pagination');
  const pageInfo = document.getElementById('pageInfo');

  if (isLoading) {
    loadingState.classList.remove('hidden');
    tableWrapper.classList.add('hidden');
    emptyAll.classList.add('hidden');
    emptyFiltered.classList.add('hidden');
    pagination.classList.add('hidden');
    return;
  } else {
    loadingState.classList.add('hidden');
  }

  const filtered = getFilteredLeads();

  if (allLeads.length === 0) {
    emptyAll.classList.remove('hidden');
    emptyFiltered.classList.add('hidden');
    tableWrapper.classList.add('hidden');
    pagination.classList.add('hidden');
    return;
  } else {
    emptyAll.classList.add('hidden');
  }

  if (filtered.length === 0) {
    emptyFiltered.classList.remove('hidden');
    tableWrapper.classList.add('hidden');
    pagination.classList.add('hidden');
    return;
  } else {
    emptyFiltered.classList.add('hidden');
    tableWrapper.classList.remove('hidden');
  }

  tbody.innerHTML = '';

  filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const paginated = filtered.slice(start, start + PAGE_SIZE);

  paginated.forEach(lead => {
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
      <td>${lead.topLead ? '★' : ''}</td>
      <td>${formatTitle(lead.searchTitle)}</td>
      <td>${statusText}</td>
      <td>${lead.requestDate || '-'}</td>
      <td>${lead.acceptanceDate || 'En attente'}</td>
      <td>${daysText}</td>
      <td><input type="checkbox" class="chk-contacted" data-id="${lead.id}" ${lead.contacted ? 'checked' : ''}></td>
      <td>
        <button class="btn-icon message-lead" data-id="${lead.id}" title="Générer un message">Message</button>
      </td>
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
  document.querySelectorAll('.message-lead').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      const lead = allLeads.find(l => l.id === id);
      if (lead) showSuggestedMessage(lead);
    });
  });

  // Pagination controls
  if (filtered.length > PAGE_SIZE) {
    pagination.classList.remove('hidden');
  pageInfo.textContent = `Page ${currentPage}/${totalPages}`;
  document.getElementById('prevPage').disabled = currentPage === 1;
  document.getElementById('nextPage').disabled = currentPage === totalPages;
} else {
  pagination.classList.add('hidden');
}
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
      currentPage = 1;
      renderTable();
    });
  });
  document.getElementById('filterKeyword').addEventListener('input', () => {
    currentPage = 1;
    renderTable();
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

  document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage -= 1;
      renderTable();
    }
  });

  document.getElementById('nextPage').addEventListener('click', () => {
    const filtered = getFilteredLeads();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPage < totalPages) {
      currentPage += 1;
      renderTable();
    }
  });

  document.getElementById('btnExportJson').addEventListener('click', async () => {
    try {
      const data = await chrome.storage.local.get(['leads', 'searchTitles']);
      const backup = {
        exportedAt: new Date().toISOString(),
        leads: data.leads || [],
        searchTitles: data.searchTitles || []
      };

      const jsonString = JSON.stringify(backup, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const filename = `linkedin-leads-backup-${new Date().toISOString().slice(0,10)}.json`;

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setFeedback('Export JSON généré.', 'success');
    } catch (error) {
      console.error('Erreur export JSON:', error);
      setFeedback('Erreur lors de l\'export JSON.', 'error');
      alert("Erreur lors de l’export JSON.");
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
          `"${(formatTitle(l.searchTitle || '').replace(/"/g, '""'))}"`,
          statusText,
          l.requestDate || '',
          l.acceptanceDate || 'En attente',
          l.acceptanceDate ? getDaysDiff(l.acceptanceDate) : '-',
          l.contacted ? 'Oui' : 'Non',
          l.contactedDate || '',
          new Date(l.createdAt).toLocaleDateString(),
          l.topLead ? 'Oui' : 'Non'
        ];
      });

      const csvHeaders = [...headers, "Top Lead"];
      const csvContent = "\uFEFF" + [csvHeaders.join(','), ...rows.map(r => r.join(','))].join('\n');
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

  document.getElementById('btnCopyMessage').addEventListener('click', async () => {
    const textarea = document.getElementById('suggested-message');
    const feedback = document.getElementById('messageFeedback');
    if (!textarea) return;
    try {
      await navigator.clipboard.writeText(textarea.value || '');
      feedback.classList.remove('hidden', 'error');
      feedback.classList.add('success');
      feedback.textContent = 'Message copié.';
    } catch (e) {
      console.error('Impossible de copier le message:', e);
      feedback.classList.remove('hidden', 'success');
      feedback.classList.add('error');
      feedback.textContent = 'Impossible de copier le message.';
    }
  });
}

function extractFirstName(name) {
  if (!name || typeof name !== 'string') return null;
  const parts = name.trim().split(/\s+/);
  return parts[0] || null;
}

function extractRoleFromHeadline(headline) {
  if (!headline || typeof headline !== 'string') return null;
  const separators = [' chez ', ' at ', ' | ', ' – ', ' - '];
  let selected = headline;
  for (const sep of separators) {
    if (headline.toLowerCase().includes(sep.trim())) {
      const idx = headline.toLowerCase().indexOf(sep.trim());
      selected = headline.substring(0, idx).trim();
      break;
    }
  }
  return selected || null;
}

function buildSuggestedMessage(lead) {
  const firstName = extractFirstName(lead.name) || "là";
  const role = extractRoleFromHeadline(lead.headline);
  const isInbound = lead.direction === 'inbound_accepted';

  const lines = [];
  lines.push(`Hello ${firstName},`);
  lines.push(isInbound ? "Merci pour ta demande de connexion." : "Merci d'avoir accepté ma demande de connexion.");
  lines.push("J'essaie de connecter davantage avec mon réseau sur LinkedIn.");
  if (role) {
    lines.push(`J'ai vu que tu étais ${role} et je trouve ça intéressant par rapport à ce que je fais.`);
  }
  lines.push("Serais-tu dispo à l'occasion pour papoter 15 min et voir ce qu'on peut s'apporter mutuellement ?");
  lines.push("Je te propose mardi à 12:00 ou jeudi à 13:30, mais je peux m'adapter à tes disponibilités.");

  return lines.join('\n');
}

function showSuggestedMessage(lead) {
  if (!lead) return;
  const section = document.getElementById('messageSection');
  const title = document.getElementById('messageTitle');
  const textarea = document.getElementById('suggested-message');
  const feedback = document.getElementById('messageFeedback');
  if (!section || !title || !textarea || !feedback) return;

  title.textContent = `Message suggéré pour ${lead.name || 'ce lead'}`;
  textarea.value = buildSuggestedMessage(lead);
  feedback.classList.add('hidden');
  section.classList.remove('hidden');
}
