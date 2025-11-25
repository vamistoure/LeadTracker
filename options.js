// Utilitaire dates
function getDaysDiff(dateString) {
  if (!dateString) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateString);
  d.setHours(0, 0, 0, 0);
  return Math.floor((today - d) / (1000 * 60 * 60 * 24));
}

function hasAssignedTitle(lead) {
  return !!(lead && (lead.searchTitle || '').trim());
}

function getLeadTimestamp(lead) {
  return lead?.updatedAt || lead?.createdAt || 0;
}

// État global
let allLeads = [];
let allTitles = [];
let isLoading = true;
let currentPage = 1;
const PAGE_SIZE = 10;
let currentSortColumn = 'createdAt';
let currentSortDir = 'desc';
const formatTitle = window?.formatTitle || ((label = '') => (label || '').trim().toUpperCase());
const normalizeTitle =
  window?.normalizeTitle || ((label = '') => (label || '').trim().toUpperCase());
const deriveCompanyFromHeadline =
  window?.deriveCompanyFromHeadline ||
  ((headline = '') => {
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
  });
const storageGetSafe = window?.storageGet || ((keys) => chrome.storage.local.get(keys));
const storageSetSafe = window?.storageSet || ((obj) => chrome.storage.local.set(obj));
let lastSuggestedLead = null;
let focusLeadId = null;
let focusLeadProfileUrl = null;
let hasAppliedFocusFilters = false;
let hasOpenedFocusDetail = false;
let isAdjustingFocusPage = false;
let focusLeadNotFoundNotified = false;
const COLUMN_DEFS = [
  { key: 'name', label: 'Nom' },
  { key: 'topLead', label: 'Top' },
  { key: 'company', label: 'Entreprise' },
  { key: 'searchTitle', label: 'Titre de recherche' },
  { key: 'direction', label: 'Type' },
  { key: 'requestDate', label: 'Demande' },
  { key: 'acceptanceDate', label: 'Acceptation' },
  { key: 'days', label: 'Jours depuis' },
  { key: 'contacted', label: 'Contacté' },
  { key: 'message', label: 'Message' },
  { key: 'actions', label: 'Actions' }
];
let columnVisibility = getDefaultColumnVisibility();

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
  await loadData();
  initFiltersFromUrl();
  renderFilters();
  applyFocusLeadFilters();
  renderColumnToggles();
  renderTable();
  setupEventListeners();
});

function getDefaultColumnVisibility() {
  return COLUMN_DEFS.reduce((acc, col) => {
    acc[col.key] = true;
    return acc;
  }, {});
}

function formatDirection(lead) {
  const dir = lead.direction;
  if (window?.DIRECTION_LABELS && window.DIRECTION_LABELS[dir]) {
    return window.DIRECTION_LABELS[dir];
  }
  return dir || 'Inconnu';
}

const LUCIDE_PATHS = {
  clock: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', 'M12 7v5l3 3'],
  send: ['M22 2 11 13', 'M22 2 15 22 11 13 2 9 22 2'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'],
  help: ['M12 17h.01', 'M12 7a4 4 0 0 0-4 4c0 1.5 1 2.5 2 3', 'M12 7a4 4 0 0 1 4 4c0 1.5-1 2.5-2 3']
};

function renderLucide(name) {
  const paths = LUCIDE_PATHS[name] || LUCIDE_PATHS.help;
  const d = paths.map((p) => `<path d="${p}" />`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
}

function getDirectionIcon(lead) {
  const label = formatDirection(lead);
  if (lead.direction === 'outbound_pending') return { icon: renderLucide('clock'), label };
  if (lead.direction === 'outbound_accepted') return { icon: renderLucide('send'), label };
  if (lead.direction === 'inbound_accepted') return { icon: renderLucide('download'), label };
  return { icon: renderLucide('help'), label };
}

function getVisibleColumns() {
  return COLUMN_DEFS.filter((col) => columnVisibility[col.key] !== false);
}

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
    const data = await storageGetSafe(['leads', 'searchTitles', 'columnVisibility']);
    allLeads = data.leads || [];
    allTitles = data.searchTitles || [];
    columnVisibility = {
      ...getDefaultColumnVisibility(),
      ...(data.columnVisibility || {})
    };
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
  focusLeadId = params.get('leadId') || null;
  focusLeadProfileUrl = params.get('profileUrl') || null;
  stripFocusParamsFromUrl();
}

function toggleFilterBadge(isActive) {
  const badge = document.getElementById('filterBadge');
  if (!badge) return;
  if (isActive) badge.classList.remove('hidden');
  else badge.classList.add('hidden');
}

function stripFocusParamsFromUrl() {
  const url = new URL(window.location.href);
  let removed = false;
  ['leadId', 'profileUrl'].forEach((param) => {
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      removed = true;
    }
  });
  if (!removed) return;
  const search = url.searchParams.toString();
  const nextUrl = search ? `${url.pathname}?${search}${url.hash}` : `${url.pathname}${url.hash}`;
  window.history.replaceState({}, '', nextUrl);
}

function getFocusedLead() {
  if (!focusLeadId && !focusLeadProfileUrl) return null;
  return (
    allLeads.find((l) => {
      if (focusLeadId && l.id === focusLeadId) return true;
      if (focusLeadProfileUrl && l.profileUrl === focusLeadProfileUrl) return true;
      return false;
    }) || null
  );
}

function applyFocusLeadFilters() {
  if (hasAppliedFocusFilters) return;
  const lead = getFocusedLead();
  if (!lead) {
    if ((focusLeadId || focusLeadProfileUrl) && !focusLeadNotFoundNotified) {
      setFeedback('Lead introuvable dans le dashboard.', 'info');
      focusLeadNotFoundNotified = true;
    }
    hasAppliedFocusFilters = true;
    return;
  }
  hasAppliedFocusFilters = true;

  const keyword = document.getElementById('filterKeyword');
  if (keyword) {
    keyword.value = lead.name || lead.company || formatTitle(lead.searchTitle) || '';
  }
  const titleSelect = document.getElementById('filterSearchTitle');
  if (titleSelect) {
    const norm = normalizeTitle(lead.searchTitle || '');
    const optionExists = Array.from(titleSelect.options || []).some((opt) => opt.value === norm);
    titleSelect.value = optionExists ? norm : 'all';
  }
  const toContact = document.getElementById('filterToContact');
  if (toContact) toContact.checked = false;
  ['filterDateFrom', 'filterDateTo'].forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.value = '';
  });
}

function renderFilters() {
  const select = document.getElementById('filterSearchTitle');
  if (!select) return;

  select.innerHTML = '<option value="all">Tous les titres</option>';

  // Comptage des titres réellement associés à des leads
  const countsByTitle = new Map();
  allLeads.forEach((l) => {
    const norm = normalizeTitle(l.searchTitle);
    if (!norm) return;
    countsByTitle.set(norm, (countsByTitle.get(norm) || 0) + 1);
  });

  // Label préférentiel : d'abord depuis la liste des titres sauvegardés, sinon depuis les leads
  const labelByTitle = new Map();
  allTitles.forEach((t) => {
    const norm = normalizeTitle(t.label);
    if (norm) labelByTitle.set(norm, formatTitle(t.label));
  });
  allLeads.forEach((l) => {
    const norm = normalizeTitle(l.searchTitle);
    if (norm && !labelByTitle.has(norm)) {
      labelByTitle.set(norm, formatTitle(l.searchTitle));
    }
  });

  Array.from(countsByTitle.entries())
    .map(([value, count]) => {
      return { value, label: labelByTitle.get(value) || value, count };
    })
    .sort((a, b) => a.label.localeCompare(b.label))
    .forEach(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      select.appendChild(opt);
    });

  // Si la valeur sélectionnée n'existe plus (pas de leads), repasser sur "all"
  if (select.value !== 'all' && !countsByTitle.has(select.value)) {
    select.value = 'all';
  }
}

function getFilteredLeads() {
  const searchTitle = document.getElementById('filterSearchTitle').value;
  const dateFrom = document.getElementById('filterDateFrom').value;
  const dateTo = document.getElementById('filterDateTo').value;
  const onlyToContact = document.getElementById('filterToContact').checked;
  const keyword = (document.getElementById('filterKeyword').value || '').toLowerCase().trim();

  toggleFilterBadge(onlyToContact);

  return allLeads.filter((lead) => {
    if (!hasAssignedTitle(lead)) return false;

    if (searchTitle !== 'all' && normalizeTitle(lead.searchTitle) !== searchTitle) return false;

    if (dateFrom) {
      if (!lead.acceptanceDate) return false;
      if (new Date(lead.acceptanceDate).getTime() < new Date(dateFrom).getTime()) return false;
    }
    if (dateTo) {
      if (!lead.acceptanceDate) return false;
      if (new Date(lead.acceptanceDate).getTime() > new Date(dateTo).getTime()) return false;
    }

    if (onlyToContact) {
      if (lead.contacted) return false;
      if (!lead.acceptanceDate) return false;
      const days = getDaysDiff(lead.acceptanceDate);
      if (days !== 5) return false;
    }

    if (keyword) {
      const haystack = [lead.name || '', lead.headline || '', lead.searchTitle || '']
        .join(' ')
        .toLowerCase();
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

  if (!hasAppliedFocusFilters && (focusLeadId || focusLeadProfileUrl)) {
    applyFocusLeadFilters();
  }

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
  const focusedLead = getFocusedLead();

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

  filtered.sort((a, b) => getLeadTimestamp(b) - getLeadTimestamp(a));

  if (focusedLead) {
    const focusIndex = filtered.findIndex((l) => l.id === focusedLead.id);
    if (focusIndex !== -1) {
      const targetPage = Math.floor(focusIndex / PAGE_SIZE) + 1;
      if (currentPage !== targetPage && !isAdjustingFocusPage) {
        isAdjustingFocusPage = true;
        currentPage = targetPage;
        renderTable();
        return;
      }
    } else if (!focusLeadNotFoundNotified) {
      setFeedback('Lead introuvable dans le dashboard.', 'info');
      focusLeadNotFoundNotified = true;
    }
  }
  isAdjustingFocusPage = false;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const paginated = filtered.slice(start, start + PAGE_SIZE);

  paginated.forEach((lead) => {
    const days = lead.acceptanceDate ? getDaysDiff(lead.acceptanceDate) : null;
    const tr = document.createElement('tr');
    tr.dataset.id = lead.id;
    const derivedCompany = deriveCompanyFromHeadline(lead.headline);
    const companyValue = lead.company || derivedCompany || '-';

    if (lead.acceptanceDate && !lead.contacted && days === 5) {
      tr.classList.add('highlight-contact');
    }
    if (focusedLead && lead.id === focusedLead.id) {
      tr.classList.add('focused-lead');
    }

    const statusText = formatDirection(lead);
    const statusIcon = getDirectionIcon(lead);

    const daysText = days !== null ? `J+${days}` : '-';

    tr.innerHTML = `
      <td data-col="name">
        <div class="profile-cell">
          <a href="${lead.profileUrl}" target="_blank" class="profile-name">${lead.name || 'Inconnu'}</a>
          <span class="profile-headline">${lead.headline ? lead.headline.substring(0, 60) + (lead.headline.length > 60 ? '...' : '') : ''}</span>
        </div>
      </td>
      <td data-col="topLead">
        <button class="btn-icon star-toggle ${lead.topLead ? 'active' : ''}" data-id="${lead.id}" title="Marquer comme Top Lead">
          ${lead.topLead ? '★' : '☆'}
        </button>
      </td>
      <td data-col="company">${companyValue}</td>
      <td data-col="searchTitle">${formatTitle(lead.searchTitle)}</td>
      <td data-col="direction">
        <span class="type-icon" title="${statusText}" aria-label="${statusText}">${statusIcon.icon}</span>
      </td>
      <td data-col="requestDate">${lead.requestDate || '-'}</td>
      <td data-col="acceptanceDate">${lead.acceptanceDate || 'En attente'}</td>
      <td data-col="days">${daysText}</td>
      <td data-col="contacted"><input type="checkbox" class="chk-contacted" data-id="${lead.id}" ${lead.contacted ? 'checked' : ''}></td>
      <td data-col="message">
        <div class="actions-inline">
          <button class="btn-icon message-lead" data-id="${lead.id}" title="Message">✉️</button>
        </div>
      </td>
      <td data-col="actions">
        <div class="actions-inline">
          <button class="btn-icon detail-lead" data-id="${lead.id}" title="Détails">🔍</button>
          ${
            lead.direction === 'outbound_pending'
              ? `<button class="btn-icon accept-lead" data-id="${lead.id}" title="Marquer comme accepté">✔️</button>`
              : ''
          }
          <button class="btn-icon delete-lead" data-id="${lead.id}" title="Supprimer">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Pagination controls
  if (filtered.length > PAGE_SIZE) {
    pagination.classList.remove('hidden');
    pageInfo.textContent = `Page ${currentPage} / ${totalPages}`;
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage === totalPages;
  } else {
    pagination.classList.add('hidden');
  }

  if (focusedLead) {
    const focusRow = tbody.querySelector(`tr[data-id="${focusedLead.id}"]`);
    if (focusRow) {
      if (!hasOpenedFocusDetail) {
        focusRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        openLeadDetail(focusedLead);
        hasOpenedFocusDetail = true;
      }
    }
  }

  applyColumnVisibility();
}

function renderColumnToggles() {
  const container = document.getElementById('columnCheckboxes');
  if (!container) return;
  container.innerHTML = '';
  COLUMN_DEFS.forEach((col) => {
    const id = `col-toggle-${col.key}`;
    const label = document.createElement('label');
    label.className = 'dropdown-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = id;
    checkbox.checked = columnVisibility[col.key] !== false;
    checkbox.dataset.col = col.key;
    const span = document.createElement('span');
    span.textContent = col.label;
    label.appendChild(checkbox);
    label.appendChild(span);
    container.appendChild(label);
    checkbox.addEventListener('change', async (e) => {
      const colKey = e.target.dataset.col;
      columnVisibility[colKey] = e.target.checked;
      await chrome.storage.local.set({ columnVisibility });
      applyColumnVisibility();
    });
  });
}

function applyColumnVisibility() {
  COLUMN_DEFS.forEach((col) => {
    const visible = columnVisibility[col.key] !== false;
    document.querySelectorAll(`[data-col="${col.key}"]`).forEach((el) => {
      if (visible) el.classList.remove('col-hidden');
      else el.classList.add('col-hidden');
    });
  });
}

function getExportableColumns() {
  return getVisibleColumns();
}

function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

async function setAllColumnsVisibility(visible) {
  COLUMN_DEFS.forEach((col) => {
    columnVisibility[col.key] = visible;
  });
  await chrome.storage.local.set({ columnVisibility });
  applyColumnVisibility();
  const container = document.getElementById('columnCheckboxes');
  if (container) {
    container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = visible;
    });
  }
}

async function handleContactChange(e) {
  const id = e.target.dataset.id;
  const isChecked = e.target.checked;

  const index = allLeads.findIndex((l) => l.id === id);
  if (index !== -1) {
    allLeads[index].contacted = isChecked;
    allLeads[index].contactedDate = isChecked
      ? allLeads[index].contactedDate || new Date().toISOString().split('T')[0]
      : allLeads[index].contactedDate;
    allLeads[index].updatedAt = Date.now();

    await chrome.storage.local.set({ leads: allLeads });
  }
}

async function toggleTopLead(id) {
  const index = allLeads.findIndex((l) => l.id === id);
  if (index === -1) return;
  allLeads[index].topLead = !allLeads[index].topLead;
  allLeads[index].updatedAt = Date.now();
  await chrome.storage.local.set({ leads: allLeads });
  renderTable();
  renderFilters();
}

async function handleAcceptLead(e) {
  const id = e.target.dataset.id || e.target.getAttribute('data-id');
  const lead = allLeads.find((l) => l.id === id);

  if (!lead || lead.direction !== 'outbound_pending') {
    return;
  }

  lead.direction = 'outbound_accepted';
  lead.acceptanceDate = new Date().toISOString().split('T')[0];
  lead.updatedAt = Date.now();

  await chrome.storage.local.set({ leads: allLeads });
  renderTable();
  renderFilters();
}

async function handleDeleteLead(e) {
  if (!confirm('Supprimer ce lead ?')) return;

  const id = e.target.dataset.id || e.target.getAttribute('data-id');
  allLeads = allLeads.filter((l) => l.id !== id);
  await chrome.storage.local.set({ leads: allLeads });
  setFeedback('Lead supprimé.', 'success');
  renderTable();
}

function debounce(fn, delay = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function setupEventListeners() {
  const btnMetrics = document.getElementById('btnMetrics');
  if (btnMetrics) {
    btnMetrics.addEventListener('click', () => {
      window.location.href = 'metrics.html';
    });
  }
  ['filterSearchTitle', 'filterDateFrom', 'filterDateTo', 'filterToContact'].forEach((id) => {
    document.getElementById(id).addEventListener('change', () => {
      currentPage = 1;
      renderTable();
    });
  });
  const debouncedFilter = debounce(() => {
    currentPage = 1;
    renderTable();
  });
  document.getElementById('filterKeyword').addEventListener('input', debouncedFilter);

  const appTitle = document.querySelector('.app-title');
  if (appTitle) {
    appTitle.style.cursor = 'pointer';
    appTitle.addEventListener('click', () => {
      window.location.reload();
    });
  }

  const resetFilters = () => {
    const valueTargets = [
      ['filterSearchTitle', 'all'],
      ['filterDateFrom', ''],
      ['filterDateTo', ''],
      ['filterKeyword', '']
    ];

    valueTargets.forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.value = value;
    });

    const toContact = document.getElementById('filterToContact');
    if (toContact) toContact.checked = false;

    currentPage = 1;
    renderTable();
  };
  const btnReset = document.getElementById('btnResetFilters');
  if (btnReset) {
    btnReset.addEventListener('click', resetFilters);
  }

  const btnCloseDetail = document.getElementById('btnCloseDetail');
  if (btnCloseDetail) {
    btnCloseDetail.addEventListener('click', () => {
      document.getElementById('leadDetailModal')?.classList.add('hidden');
    });
  }
  const btnSaveDetail = document.getElementById('btnSaveDetail');
  if (btnSaveDetail) {
    btnSaveDetail.addEventListener('click', saveLeadDetail);
  }
  const btnExportDetail = document.getElementById('btnExportDetail');
  if (btnExportDetail) {
    btnExportDetail.addEventListener('click', exportLeadDetailCsv);
  }

  const btnColumns = document.getElementById('btnColumns');
  const columnDropdown = document.getElementById('columnDropdown');
  if (btnColumns && columnDropdown) {
    btnColumns.addEventListener('click', (e) => {
      e.stopPropagation();
      columnDropdown.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      if (
        !columnDropdown.classList.contains('hidden') &&
        !columnDropdown.contains(e.target) &&
        e.target !== btnColumns
      ) {
        columnDropdown.classList.add('hidden');
      }
    });
  }

  const btnShowAllCols = document.getElementById('btnShowAllCols');
  if (btnShowAllCols) {
    btnShowAllCols.addEventListener('click', () => setAllColumnsVisibility(true));
  }
  const btnHideAllCols = document.getElementById('btnHideAllCols');
  if (btnHideAllCols) {
    btnHideAllCols.addEventListener('click', () => setAllColumnsVisibility(false));
  }

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

  const tableWrapper = document.getElementById('tableWrapper');
  if (tableWrapper) {
    tableWrapper.addEventListener('change', (e) => {
      const contactBox = e.target.closest('.chk-contacted');
      if (contactBox) {
        handleContactChange(e);
      }
    });
    tableWrapper.addEventListener('click', (e) => {
      const starBtn = e.target.closest('.star-toggle');
      if (starBtn) {
        e.preventDefault();
        const id = starBtn.getAttribute('data-id');
        toggleTopLead(id);
        return;
      }
      const deleteBtn = e.target.closest('.delete-lead');
      if (deleteBtn) {
        e.preventDefault();
        handleDeleteLead({ target: deleteBtn });
        return;
      }
      const acceptBtn = e.target.closest('.accept-lead');
      if (acceptBtn) {
        e.preventDefault();
        handleAcceptLead({ target: acceptBtn });
        return;
      }
      const messageBtn = e.target.closest('.message-lead');
      if (messageBtn) {
        e.preventDefault();
        const id = messageBtn.getAttribute('data-id');
        const lead = allLeads.find((l) => l.id === id);
        if (lead) showSuggestedMessage(lead);
        return;
      }
      const detailBtn = e.target.closest('.detail-lead');
      if (detailBtn) {
        e.preventDefault();
        const id = detailBtn.getAttribute('data-id');
        const lead = allLeads.find((l) => l.id === id);
        if (lead) openLeadDetail(lead);
      }
    });
  }

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
      const filename = `linkedin-leads-backup-${new Date().toISOString().slice(0, 10)}.json`;

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
      setFeedback("Erreur lors de l'export JSON.", 'error');
      alert('Erreur lors de l’export JSON.');
    }
  });

  document.getElementById('btnExport').addEventListener('click', () => {
    try {
      const filtered = getFilteredLeads();
      if (filtered.length === 0) {
        setFeedback('Aucun lead à exporter avec les filtres actuels.', 'info');
        return;
      }

      const exportCols = getExportableColumns();
      if (exportCols.length === 0) {
        setFeedback("Sélectionnez au moins une colonne avant d'exporter.", 'info');
        return;
      }

      const headers = exportCols.map((col) => csvEscape(col.label));
      const rows = filtered.map((l) => {
        const statusText = formatDirection(l);
        const days = l.acceptanceDate ? getDaysDiff(l.acceptanceDate) : null;
        const exportCompany = l.company || deriveCompanyFromHeadline(l.headline) || '-';
        return exportCols.map((col) => {
          switch (col.key) {
            case 'name':
              return csvEscape(l.name || 'Inconnu');
            case 'topLead':
              return csvEscape(l.topLead ? 'Oui' : 'Non');
            case 'company':
              return csvEscape(exportCompany);
            case 'searchTitle':
              return csvEscape(formatTitle(l.searchTitle || ''));
            case 'direction':
              return csvEscape(statusText);
            case 'requestDate':
              return csvEscape(l.requestDate || '');
            case 'acceptanceDate':
              return csvEscape(l.acceptanceDate || 'En attente');
            case 'days':
              return csvEscape(days !== null ? `J+${days}` : '-');
            case 'contacted':
              return csvEscape(l.contacted ? 'Oui' : 'Non');
            case 'message':
            case 'actions':
              return csvEscape('');
            default:
              return csvEscape('');
          }
        });
      });

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `linkedin_leads_${new Date().toISOString().slice(0, 10)}.csv`);
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
      if (lastSuggestedLead?.profileUrl) {
        window.open(lastSuggestedLead.profileUrl, '_blank');
      }
      feedback.classList.remove('hidden', 'error');
      feedback.classList.add('success');
      feedback.textContent = 'Message copié. Profil ouvert pour envoyer votre message.';
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

function openLeadDetail(lead) {
  lastSuggestedLead = lead;
  const modal = document.getElementById('leadDetailModal');
  const feedback = document.getElementById('detailFeedback');
  if (!modal) return;
  const derivedCompany = deriveCompanyFromHeadline(lead.headline);
  document.getElementById('detailName').textContent = lead.name || 'Inconnu';
  document.getElementById('detailHeadline').textContent = lead.headline || '';
  document.getElementById('detailCompany').textContent = lead.company || derivedCompany || '';
  document.getElementById('detailStatus').value = lead.status || '';
  document.getElementById('detailTags').value = Array.isArray(lead.tags)
    ? lead.tags.join(', ')
    : lead.tags || '';
  document.getElementById('detailDirection').value = lead.direction || 'outbound_pending';
  document.getElementById('detailSearchTitle').value = lead.searchTitle || '';
  document.getElementById('detailRequestDate').value = lead.requestDate || '';
  document.getElementById('detailAcceptanceDate').value = lead.acceptanceDate || '';
  document.getElementById('detailContactDate').value = lead.contactedDate || '';
  document.getElementById('detailConversionDate').value = lead.conversionDate || '';
  document.getElementById('detailContacted').checked = !!lead.contacted;
  document.getElementById('detailConverted').checked = !!lead.converted;
  document.getElementById('detailNotes').value = lead.notes || '';
  feedback.classList.add('hidden');
  modal.classList.remove('hidden');
}

async function saveLeadDetail() {
  const feedback = document.getElementById('detailFeedback');
  try {
    const data = await chrome.storage.local.get(['leads']);
    let leads = data.leads || [];
    const idx = leads.findIndex((l) => l.id === lastSuggestedLead?.id);
    if (idx === -1) return;
    const updated = {
      ...leads[idx],
      status: document.getElementById('detailStatus').value.trim(),
      tags: document
        .getElementById('detailTags')
        .value.split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      direction: document.getElementById('detailDirection').value,
      searchTitle:
        document.getElementById('detailSearchTitle').value.trim() || leads[idx].searchTitle,
      requestDate: document.getElementById('detailRequestDate').value || null,
      acceptanceDate: document.getElementById('detailAcceptanceDate').value || null,
      contactedDate: document.getElementById('detailContactDate').value || null,
      conversionDate: document.getElementById('detailConversionDate').value || null,
      contacted: document.getElementById('detailContacted').checked,
      converted: document.getElementById('detailConverted').checked,
      notes: document.getElementById('detailNotes').value
    };
    leads[idx] = updated;
    leads[idx].updatedAt = Date.now();
    await chrome.storage.local.set({ leads });
    setFeedback('Lead mis à jour.', 'success');
    feedback.classList.remove('hidden', 'error');
    feedback.classList.add('success');
    feedback.textContent = 'Lead mis à jour.';
    renderTable();
  } catch (e) {
    console.error('Erreur mise à jour lead detail:', e);
    feedback.classList.remove('hidden', 'success');
    feedback.classList.add('error');
    feedback.textContent = 'Erreur lors de la mise à jour.';
  }
}

function exportLeadDetailCsv() {
  if (!lastSuggestedLead) return;
  const lead = lastSuggestedLead;
  const headers = [
    'Nom',
    'Headline',
    'Entreprise',
    'URL Profil',
    'Titre Recherche',
    'Type',
    'Date Demande',
    'Date Acceptation',
    'Contacté',
    'Date Contact',
    'Conversion',
    'Date Conversion',
    'Tags',
    'Statut',
    'Notes',
    'Date Création'
  ];
  const row = [
    `"${(lead.name || '').replace(/"/g, '""')}"`,
    `"${(lead.headline || '').replace(/"/g, '""')}"`,
    `"${(lead.company || '').replace(/"/g, '""')}"`,
    lead.profileUrl || '',
    `"${formatTitle(lead.searchTitle || '').replace(/"/g, '""')}"`,
    lead.direction || '',
    lead.requestDate || '',
    lead.acceptanceDate || '',
    lead.contacted ? 'Oui' : 'Non',
    lead.contactedDate || '',
    lead.converted ? 'Oui' : 'Non',
    lead.conversionDate || '',
    `"${Array.isArray(lead.tags) ? lead.tags.join(';').replace(/"/g, '""') : (lead.tags || '').replace(/"/g, '""')}"`,
    `"${(lead.status || '').replace(/"/g, '""')}"`,
    `"${(lead.notes || '').replace(/"/g, '""')}"`,
    lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : ''
  ];
  const csv = '\uFEFF' + [headers.join(','), row.join(',')].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `lead_${lead.id}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
function nextWorkingDaySlots() {
  const isWeekend = (d) => {
    const day = d.getDay();
    return day === 0 || day === 6;
  };

  let first = new Date();
  first.setHours(0, 0, 0, 0);
  while (isWeekend(first)) {
    first.setDate(first.getDate() + 1);
  }
  if (first.toDateString() === new Date().toDateString()) {
    first.setDate(first.getDate() + 1);
    while (isWeekend(first)) first.setDate(first.getDate() + 1);
  }

  let second = new Date(first);
  second.setDate(first.getDate() + 1);
  while (isWeekend(second)) {
    second.setDate(second.getDate() + 1);
  }

  const formatSlot = (date, hour, minute) => {
    const day = date.getDate();
    const weekday = date.toLocaleDateString('fr-FR', { weekday: 'long' });
    const hh = hour.toString().padStart(2, '0');
    const mm = minute.toString().padStart(2, '0');
    return `${weekday} ${day} à ${hh}h${mm}`;
  };

  return [{ label: formatSlot(first, 12, 0) }, { label: formatSlot(second, 15, 0) }];
}

function buildSuggestedMessage(lead) {
  const firstName = extractFirstName(lead.name) || 'là';
  const role = extractRoleFromHeadline(lead.headline);
  const isInbound = lead.direction === 'inbound_accepted';
  const slots = nextWorkingDaySlots();

  const lines = [];
  lines.push(`Hello ${firstName},`);
  lines.push(
    isInbound
      ? 'Merci pour ta demande de connexion.'
      : "Merci d'avoir accepté ma demande de connexion."
  );
  lines.push("J'essaie de connecter davantage avec mon réseau sur LinkedIn.");
  if (role) {
    lines.push(
      `J'ai vu que tu étais ${role} et je trouve ça intéressant par rapport à ce que je fais.`
    );
  }
  lines.push(
    "Serais-tu dispo à l'occasion pour papoter 15 min et voir ce qu'on peut s'apporter mutuellement ?"
  );
  if (slots && slots.length === 2) {
    lines.push(
      `Je te propose ${slots[0].label} ou ${slots[1].label}, mais je peux m'adapter à tes disponibilités.`
    );
  }

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
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  lastSuggestedLead = lead;
}
