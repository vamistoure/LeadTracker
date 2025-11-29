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
const DEFAULT_SORT_DIRECTION = {
  name: 'asc',
  topLead: 'desc',
  company: 'asc',
  companySegment: 'asc',
  employeeRange: 'asc',
  companyIndustry: 'asc',
  geo: 'asc',
  searchTitle: 'asc',
  direction: 'asc',
  requestDate: 'desc',
  acceptanceDate: 'desc',
  days: 'desc',
  contacted: 'desc',
  message: 'desc',
  actions: 'desc',
  createdAt: 'desc',
  updatedAt: 'desc'
};
let currentSortColumn = 'createdAt';
let currentSortDir = DEFAULT_SORT_DIRECTION[currentSortColumn] || 'desc';
const formatTitle = window?.formatTitle || ((label = '') => (label || '').trim().toUpperCase());
const normalizeTitle =
  window?.normalizeTitle || ((label = '') => (label || '').trim().toUpperCase());
const parseEmployeeRange =
  window?.parseEmployeeRange ||
  ((raw = '') => {
    if (!raw || typeof raw !== 'string') return null;
    const text = raw.replace(/\u202f/g, ' ').replace(/\u00a0/g, ' ').trim();
    if (!text) return null;
    const num = parseInt(text.replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(num)) return { min: num, max: num, raw: text };
    return null;
  });
const computeCompanySegment =
  window?.computeCompanySegment ||
  ((range) => {
    if (!range || (!range.min && !range.max)) return null;
    const point = range.max || range.min || 0;
    if (point <= 10) return 'Startup';
    if (point <= 50) return 'Scale-up';
    if (point <= 250) return 'PME';
    if (point <= 1000) return 'ETI';
    return 'Grand groupe';
  });
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
const DEFAULT_TEMPLATE_ID = 'intro';
let selectedTemplateId = DEFAULT_TEMPLATE_ID;
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
  { key: 'companySegment', label: 'Segment' },
  { key: 'employeeRange', label: 'Range employés' },
  { key: 'companyIndustry', label: 'Secteur' },
  { key: 'geo', label: 'Zone géographique' },
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

function isTopLeadByRules(lead) {
  const headlineUpper = (lead.headline || '').toUpperCase();
  const titleUpper = (lead.searchTitle || '').toUpperCase();
  const companySegment = (lead.companySegment || '').toUpperCase();
  const range = parseEmployeeRange(lead.employeeRange || '');
  const maxEmp = range?.max || range?.min || null;
  const tags = Array.isArray(lead.tags)
    ? lead.tags.map((t) => t.toUpperCase())
    : (lead.tags || '').toUpperCase();
  const industryUpper = (lead.companyIndustry || '').toUpperCase();

  // Règle 1: CEO/CTO et moins de 500 employés
  if (
    (headlineUpper.includes('CEO') || headlineUpper.includes('CTO')) &&
    maxEmp !== null &&
    maxEmp < 500
  ) {
    return true;
  }

  // Règle 2: Head/VP/Data Director dans une scale-up / PME (50-500)
  const dataTitles = ['HEAD OF DATA', 'VP DATA', 'DATA DIRECTOR', 'CHIEF DATA', 'CDO'];
  const matchDataTitle = dataTitles.some(
    (t) => headlineUpper.includes(t) || titleUpper.includes(t)
  );
  if (
    matchDataTitle &&
    ((companySegment === 'SCALE-UP' || companySegment === 'PME') ||
      (maxEmp !== null && maxEmp >= 50 && maxEmp <= 500))
  ) {
    return true;
  }

  // Règle 3: Non contacté, accepté récemment (<=3 jours) et persona data/lead
  if (!lead.contacted && lead.acceptanceDate) {
    const days = getDaysDiff(lead.acceptanceDate);
    if (Number.isFinite(days) && days <= 3 && (matchDataTitle || headlineUpper.includes('LEAD')))
      return true;
  }

  // Règle 4: Non contacté, accepté récemment (<=7 jours)
  if (!lead.contacted && lead.acceptanceDate) {
    const daysSince = getDaysDiff(lead.acceptanceDate);
    if (Number.isFinite(daysSince) && daysSince <= 7) return true;
  }

  // Règle 5: Dormant >30 jours et jamais contacté
  if (!lead.contacted && lead.acceptanceDate) {
    const daysSince = getDaysDiff(lead.acceptanceDate);
    if (Number.isFinite(daysSince) && daysSince > 30) return true;
  }

  // Règle 6: Secteur cible + taille 50-500
  if (
    maxEmp !== null &&
    maxEmp >= 50 &&
    maxEmp <= 500 &&
    (industryUpper.includes('SAAS') || industryUpper.includes('FINTECH') || industryUpper.includes('DATA'))
  ) {
    return true;
  }

  // Règle 7: Tag prioritaire
  if (tags && typeof tags === 'string' && tags.includes('PRIORITAIRE')) return true;
  if (Array.isArray(tags) && tags.some((t) => t.includes('PRIORITAIRE'))) return true;

  return false;
}

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
  await loadSupabaseSession();
  
  // Exposer la fonction d'import dans la console pour usage manuel
  window.importBackupToSupabase = importBackupToSupabase;
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
    allLeads = (data.leads || []).map((l) => {
      if (l.topLead) return l;
      const autoTop = isTopLeadByRules(l);
      return autoTop ? { ...l, topLead: true, updatedAt: Date.now() } : l;
    });
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

async function loadSupabaseSession() {
  try {
    const { supabaseAccessToken, supabaseUser, supabaseLastSync } = await storageGetSafe([
      'supabaseAccessToken',
      'supabaseUser',
      'supabaseLastSync'
    ]);
    if (supabaseUser) {
      const status = document.getElementById('supaStatus');
      if (status) {
        status.classList.remove('hidden', 'error', 'success');
        status.classList.add('info');
        status.textContent = `Connecté en tant que ${supabaseUser.email || 'user'}${
          supabaseLastSync ? ` • Dernière sync: ${new Date(supabaseLastSync).toLocaleString()}` : ''
        }`;
      }
    }
    return { supabaseAccessToken, supabaseUser };
  } catch (e) {
    console.warn('Supabase session load failed:', e);
    return {};
  }
}

function setSupaStatus(message, type = 'info') {
  const status = document.getElementById('supaStatus');
  if (!status) return;
  status.classList.remove('hidden', 'error', 'info', 'success');
  status.classList.add(type);
  status.textContent = message;
}

// Fonction utilitaire pour vérifier si Supabase est configuré
async function isSupabaseConfigured() {
  try {
    const data = await storageGetSafe(['supabaseAccessToken', 'supabaseMode']);
    // Si le mode local est activé, Supabase n'est pas utilisé
    if (data?.supabaseMode === 'local') {
      return false;
    }
    return !!(data?.supabaseAccessToken && typeof data.supabaseAccessToken === 'string');
  } catch (e) {
    return false;
  }
}

// Fonction utilitaire pour pousser automatiquement les leads vers Supabase
async function pushLeadToSupabase(lead) {
  if (!lead) return;
  
  // Vérifier si Supabase est configuré avant de continuer
  const isConfigured = await isSupabaseConfigured();
  if (!isConfigured) {
    // Mode local : pas de synchronisation, fonctionnement normal
    return;
  }
  
  try {
    // Vérifier si Supabase est disponible
    if (!window?.supabaseSync || !window.supabaseSync.pushChanges) {
      console.warn('[LeadTracker] Supabase sync non disponible');
      return;
    }
    
    // Vérifier si l'utilisateur est connecté à Supabase
    const { supabaseAccessToken } = await storageGetSafe(['supabaseAccessToken']);
    if (!supabaseAccessToken) {
      return;
    }
    
    // Pousser le lead vers Supabase
    await window.supabaseSync.pushChanges(supabaseAccessToken, { 
      leads: [lead], 
      searchTitles: [] 
    });
    
    // Mettre à jour la dernière sync
    await storageSetSafe({
      supabaseLastSync: new Date().toISOString()
    });
    
    console.log('[LeadTracker] Lead synchronisé avec Supabase:', lead.id || lead.profileUrl);
  } catch (e) {
    // Erreur silencieuse - ne pas perturber l'utilisateur
    console.warn('[LeadTracker] Erreur synchronisation Supabase:', e.message);
  }
}

// Fonction pour pousser plusieurs leads vers Supabase
async function pushLeadsToSupabase(leads) {
  if (!leads || !leads.length) return;
  
  // Vérifier si Supabase est configuré avant de continuer
  const isConfigured = await isSupabaseConfigured();
  if (!isConfigured) {
    // Mode local : pas de synchronisation, fonctionnement normal
    return;
  }
  
  try {
    if (!window?.supabaseSync || !window.supabaseSync.pushChanges) {
      return;
    }
    
    const { supabaseAccessToken } = await storageGetSafe(['supabaseAccessToken']);
    if (!supabaseAccessToken) {
      return;
    }
    
    await window.supabaseSync.pushChanges(supabaseAccessToken, { 
      leads, 
      searchTitles: [] 
    });
    
    await storageSetSafe({
      supabaseLastSync: new Date().toISOString()
    });
    
    console.log(`[LeadTracker] ${leads.length} leads synchronisés avec Supabase`);
  } catch (e) {
    console.warn('[LeadTracker] Erreur synchronisation Supabase:', e.message);
  }
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
  const searchTitle = document.getElementById('filterSearchTitle')?.value || 'all';
  const dateFrom = document.getElementById('filterDateFrom')?.value || '';
  const dateTo = document.getElementById('filterDateTo')?.value || '';
  const onlyToContact = !!document.getElementById('filterToContact')?.checked;
  const keyword = (document.getElementById('filterKeyword')?.value || '').toLowerCase().trim();
  const segmentFilter = document.getElementById('filterCompanySegment')?.value || 'all';
  const industryFilter = (document.getElementById('filterIndustry')?.value || '').toLowerCase().trim();
  const empMin = parseInt(document.getElementById('filterEmpMin')?.value, 10);
  const empMax = parseInt(document.getElementById('filterEmpMax')?.value, 10);
  const directionFilter = document.getElementById('filterDirection')?.value || 'all';
  const onlyTopLead = !!document.getElementById('filterTopLead')?.checked;
  const geoFilter = (document.getElementById('filterGeo')?.value || '').toLowerCase().trim();

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

    if (onlyTopLead && !lead.topLead) return false;

    if (segmentFilter !== 'all') {
      const derivedSegment =
        lead.companySegment ||
        computeCompanySegment(parseEmployeeRange(lead.employeeRange || '') || null) ||
        '';
      if ((derivedSegment || '').toLowerCase() !== segmentFilter.toLowerCase()) return false;
    }

    if (industryFilter) {
      const industry = (lead.companyIndustry || '').toLowerCase();
      if (!industry.includes(industryFilter)) return false;
    }

    if (geoFilter) {
      const geo = (lead.geo || '').toLowerCase();
      if (!geo.includes(geoFilter)) return false;
    }

    if (Number.isFinite(empMin) || Number.isFinite(empMax)) {
      const parsedRange = parseEmployeeRange(lead.employeeRange || '');
      if (!parsedRange) return false;
      if (Number.isFinite(empMin) && parsedRange.max !== null && parsedRange.max < empMin)
        return false;
      if (Number.isFinite(empMax) && parsedRange.min !== null && parsedRange.min > empMax)
        return false;
    }

    if (directionFilter !== 'all' && lead.direction !== directionFilter) return false;

    return true;
  });
}

function getSortValue(lead, column) {
  switch (column) {
    case 'name':
      return (lead.name || '').toLowerCase();
    case 'company':
      return (lead.company || deriveCompanyFromHeadline(lead.headline) || '').toLowerCase();
    case 'companySegment':
      return (lead.companySegment || '').toLowerCase();
    case 'employeeRange':
      return (lead.employeeRange || '').toLowerCase();
    case 'companyIndustry':
      return (lead.companyIndustry || '').toLowerCase();
    case 'geo':
      return (lead.geo || '').toLowerCase();
    case 'searchTitle':
      return normalizeTitle(lead.searchTitle || '');
    case 'direction':
      return formatDirection(lead).toLowerCase();
    case 'requestDate': {
      if (!lead.requestDate) return null;
      const ts = new Date(lead.requestDate).getTime();
      return Number.isFinite(ts) ? ts : null;
    }
    case 'acceptanceDate': {
      if (!lead.acceptanceDate) return null;
      const ts = new Date(lead.acceptanceDate).getTime();
      return Number.isFinite(ts) ? ts : null;
    }
    case 'days': {
      if (!lead.acceptanceDate) return null;
      const diff = getDaysDiff(lead.acceptanceDate);
      return Number.isFinite(diff) ? diff : null;
    }
    case 'contacted':
      return lead.contacted ? 1 : 0;
    case 'topLead':
      return lead.topLead ? 1 : 0;
    case 'message':
    case 'actions':
      return getLeadTimestamp(lead);
    default:
      return getLeadTimestamp(lead);
  }
}

function compareLeads(a, b) {
  const valA = getSortValue(a, currentSortColumn);
  const valB = getSortValue(b, currentSortColumn);
  const missingA = valA === null || valA === undefined || valA === '';
  const missingB = valB === null || valB === undefined || valB === '';

  if (missingA && !missingB) return 1;
  if (!missingA && missingB) return -1;

  const dir = currentSortDir === 'asc' ? 1 : -1;

  if (typeof valA === 'string' || typeof valB === 'string') {
    const aStr = (valA || '').toString();
    const bStr = (valB || '').toString();
    const cmp = aStr.localeCompare(bStr, 'fr', { sensitivity: 'base' });
    if (cmp !== 0) return cmp * dir;
  } else if (typeof valA === 'number' && typeof valB === 'number') {
    if (valA !== valB) return (valA - valB) * dir;
  }

  const fallback = getLeadTimestamp(b) - getLeadTimestamp(a);
  if (fallback !== 0) return fallback;
  return 0;
}

function updateSortIndicators() {
  const headers = document.querySelectorAll('#leadsTable thead th');
  if (!headers || !headers.length) return;
  headers.forEach((th) => {
    const col = th.dataset.col;
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (col === currentSortColumn) {
      th.classList.add(currentSortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      th.setAttribute('aria-sort', currentSortDir === 'asc' ? 'ascending' : 'descending');
    } else {
      th.setAttribute('aria-sort', 'none');
    }
  });
}

function applySort(columnKey) {
  if (!columnKey) return;
  if (currentSortColumn === columnKey) {
    currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortColumn = columnKey;
    currentSortDir = DEFAULT_SORT_DIRECTION[columnKey] || 'asc';
  }
  currentPage = 1;
  renderTable();
}

function setupSorting() {
  const headers = document.querySelectorAll('#leadsTable thead th');
  if (!headers || !headers.length) return;
  headers.forEach((th) => {
    const col = th.dataset.col;
    if (!col) return;
    th.classList.add('sortable');
    th.setAttribute('role', 'button');
    th.setAttribute('tabindex', '0');
    th.addEventListener('click', () => applySort(col));
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        applySort(col);
      }
    });
  });
  updateSortIndicators();
}

function renderTable() {
  const tableWrapper = document.getElementById('tableWrapper');
  const tbody = document.querySelector('#leadsTable tbody');
  const emptyAll = document.getElementById('emptyAll');
  const emptyFiltered = document.getElementById('emptyFiltered');
  const loadingState = document.getElementById('loadingState');
  const pagination = document.getElementById('pagination');
  const pageInfo = document.getElementById('pageInfo');

  updateSortIndicators();

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

  filtered.sort(compareLeads);

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
      <td data-col="companySegment">${lead.companySegment || ''}</td>
      <td data-col="employeeRange">${lead.employeeRange || ''}</td>
      <td data-col="companyIndustry">${lead.companyIndustry || ''}</td>
      <td data-col="geo">${lead.geo || ''}</td>
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
    
    // Synchroniser automatiquement avec Supabase
    await pushLeadToSupabase(allLeads[index]);
  }
}

async function toggleTopLead(id) {
  const index = allLeads.findIndex((l) => l.id === id);
  if (index === -1) return;
  allLeads[index].topLead = !allLeads[index].topLead;
  allLeads[index].updatedAt = Date.now();
  await chrome.storage.local.set({ leads: allLeads });
  
  // Synchroniser automatiquement avec Supabase
  await pushLeadToSupabase(allLeads[index]);
  
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
  
  // Synchroniser automatiquement avec Supabase
  await pushLeadToSupabase(lead);
  
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
  const btnSupaLogin = document.getElementById('btnSupaLogin');
  if (btnSupaLogin) {
    btnSupaLogin.addEventListener('click', handleSupabaseLogin);
  }
  const btnSupaSync = document.getElementById('btnSupaSync');
  if (btnSupaSync) {
    btnSupaSync.addEventListener('click', handleSupabaseSync);
  }
  setupSorting();
  [
    'filterSearchTitle',
    'filterDateFrom',
    'filterDateTo',
    'filterToContact',
    'filterCompanySegment',
    'filterDirection',
    'filterTopLead'
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      currentPage = 1;
      renderTable();
    });
  });
  const debouncedFilter = debounce(() => {
    currentPage = 1;
    renderTable();
  });
  ['filterKeyword', 'filterIndustry', 'filterEmpMin', 'filterEmpMax'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', debouncedFilter);
  });

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
      ['filterKeyword', ''],
      ['filterCompanySegment', 'all'],
      ['filterIndustry', ''],
      ['filterEmpMin', ''],
      ['filterEmpMax', ''],
      ['filterGeo', ''],
      ['filterDirection', 'all']
    ];

    valueTargets.forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.value = value;
    });

    const toContact = document.getElementById('filterToContact');
    if (toContact) toContact.checked = false;
    const topLead = document.getElementById('filterTopLead');
    if (topLead) topLead.checked = false;

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
            case 'companySegment':
              return csvEscape(l.companySegment || '');
            case 'employeeRange':
              return csvEscape(l.employeeRange || '');
            case 'companyIndustry':
              return csvEscape(l.companyIndustry || '');
            case 'geo':
              return csvEscape(l.geo || '');
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

  const templateTabs = document.getElementById('templateTabs');
  if (templateTabs) {
    templateTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.template-tab');
      if (!tab || !tab.dataset.template) return;
      selectedTemplateId = tab.dataset.template;
      renderTemplateTabs();
      if (lastSuggestedLead) {
        renderSuggestedMessage(lastSuggestedLead);
      }
    });
  }
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
  const companyValue = lead.company || derivedCompany || '';
  document.getElementById('detailName').textContent = lead.name || 'Inconnu';
  document.getElementById('detailHeadline').textContent = lead.headline || '';
  document.getElementById('detailCompany').textContent = companyValue;
  const companyInput = document.getElementById('detailCompanyInput');
  if (companyInput) companyInput.value = companyValue;
  const segmentInput = document.getElementById('detailCompanySegment');
  if (segmentInput) segmentInput.value = lead.companySegment || '';
  const rangeInput = document.getElementById('detailEmployeeRange');
  if (rangeInput) rangeInput.value = lead.employeeRange || '';
  const industryInput = document.getElementById('detailCompanyIndustry');
  if (industryInput) industryInput.value = lead.companyIndustry || '';
  const geoInput = document.getElementById('detailGeo');
  if (geoInput) geoInput.value = lead.geo || '';
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
      company:
        document.getElementById('detailCompanyInput')?.value.trim() ||
        leads[idx].company ||
        '',
      companySegment: document.getElementById('detailCompanySegment')?.value.trim() || '',
      employeeRange: document.getElementById('detailEmployeeRange')?.value.trim() || '',
      companyIndustry: document.getElementById('detailCompanyIndustry')?.value.trim() || '',
      geo: document.getElementById('detailGeo')?.value.trim() || '',
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
    
    // Synchroniser automatiquement avec Supabase
    await pushLeadToSupabase(leads[idx]);
    
    const headerCompany = document.getElementById('detailCompany');
    if (headerCompany) headerCompany.textContent = updated.company || '';
    const segmentInput = document.getElementById('detailCompanySegment');
    if (segmentInput) segmentInput.value = updated.companySegment || '';
    const rangeInput = document.getElementById('detailEmployeeRange');
    if (rangeInput) rangeInput.value = updated.employeeRange || '';
    const industryInput = document.getElementById('detailCompanyIndustry');
    if (industryInput) industryInput.value = updated.companyIndustry || '';
    const geoInput = document.getElementById('detailGeo');
    if (geoInput) geoInput.value = updated.geo || '';
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

function buildIntroMessage(lead) {
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

function buildFollowUpMessage(lead) {
  const firstName = extractFirstName(lead.name) || 'là';
  const role = extractRoleFromHeadline(lead.headline);
  const slots = nextWorkingDaySlots();
  const days = lead.acceptanceDate ? getDaysDiff(lead.acceptanceDate) : null;
  const daySuffix = days !== null ? ` (J+${days})` : '';

  const lines = [];
  lines.push(`Hello ${firstName},`);
  lines.push(`Je me permets une courte relance${daySuffix} suite à notre connexion.`);
  if (role) {
    lines.push(`En tant que ${role}, je pense qu'un échange rapide serait utile des deux côtés.`);
  } else {
    lines.push("Je pense qu'on peut peut-être s'apporter mutuellement en quelques minutes.");
  }
  lines.push(
    "Toujours partant(e) pour 15 min ? Je peux te proposer deux créneaux et m'adapter si besoin."
  );
  if (slots && slots.length === 2) {
    lines.push(`Par exemple ${slots[0].label} ou ${slots[1].label}.`);
  }
  lines.push("Sinon, n'hésite pas à me dire quand c'est mieux pour toi.");

  return lines.join('\n');
}

const MESSAGE_TEMPLATES = [
  {
    id: 'intro',
    label: 'Premier message',
    description: 'Remercier pour la connexion et proposer un échange de 15 min.',
    build: buildIntroMessage
  },
  {
    id: 'followup',
    label: 'Relance courte',
    description: 'Relancer un lead sans réponse en proposant 2 créneaux précis.',
    build: buildFollowUpMessage
  }
];

function getTemplateById(id) {
  const found = MESSAGE_TEMPLATES.find((tpl) => tpl.id === id);
  if (found) return found;
  selectedTemplateId = MESSAGE_TEMPLATES[0].id;
  return MESSAGE_TEMPLATES[0];
}

function renderTemplateTabs() {
  const tabs = document.querySelectorAll('#templateTabs .template-tab');
  const current = getTemplateById(selectedTemplateId);
  tabs.forEach((btn) => {
    const isActive = btn.dataset.template === current.id;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  const hint = document.getElementById('templateDescription');
  if (hint) {
    hint.textContent = current.description || '';
  }
}

function renderSuggestedMessage(lead) {
  const textarea = document.getElementById('suggested-message');
  const title = document.getElementById('messageTitle');
  const template = getTemplateById(selectedTemplateId);
  if (title && template) {
    title.textContent = `${template.label} pour ${lead.name || 'ce lead'}`;
  }
  if (textarea && template) {
    textarea.value = template.build(lead);
  }
}

function showSuggestedMessage(lead) {
  if (!lead) return;
  const section = document.getElementById('messageSection');
  const feedback = document.getElementById('messageFeedback');
  if (!section || !feedback) return;

  lastSuggestedLead = lead;
  renderTemplateTabs();
  renderSuggestedMessage(lead);
  feedback.classList.add('hidden');
  section.classList.remove('hidden');
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function handleSupabaseLogin() {
  const email = document.getElementById('supaEmail')?.value.trim();
  const password = document.getElementById('supaPassword')?.value;
  if (!email || !password) {
    setSupaStatus('Email et mot de passe requis.', 'error');
    return;
  }
  if (!window?.supabaseSync || !window.supabaseSync.signInWithPassword) {
    setSupaStatus('Supabase non disponible dans cette page.', 'error');
    return;
  }
  setSupaStatus('Connexion en cours...', 'info');
  try {
    const res = await window.supabaseSync.signInWithPassword(email, password);
    const accessToken = res?.access_token;
    if (!accessToken) throw new Error('Token absent');
    await storageSetSafe({
      supabaseAccessToken: accessToken,
      supabaseUser: { email },
      supabaseLastSync: null
    });
    setSupaStatus(`Connecté en tant que ${email}.`, 'success');
  } catch (e) {
    console.error('Supabase login failed:', e);
    setSupaStatus('Connexion Supabase échouée. Vérifiez vos identifiants.', 'error');
  } finally {
    const pwd = document.getElementById('supaPassword');
    if (pwd) pwd.value = '';
  }
}

async function handleSupabaseSync() {
  if (!window?.supabaseSync || !window.supabaseSync.syncAll) {
    setSupaStatus('Supabase non disponible dans cette page.', 'error');
    return;
  }
  const { supabaseAccessToken } = await storageGetSafe(['supabaseAccessToken']);
  if (!supabaseAccessToken) {
    setSupaStatus('Connectez-vous à Supabase avant de synchroniser.', 'error');
    return;
  }
  setSupaStatus('Synchronisation en cours...', 'info');
  try {
    const data = await storageGetSafe(['leads', 'searchTitles', 'supabaseLastSync']);
    const localLeads = data.leads || [];
    const localTitles = data.searchTitles || [];
    const since = data.supabaseLastSync || null;
    const { mergedLeads, mergedTitles } = await window.supabaseSync.syncAll(supabaseAccessToken, {
      localLeads,
      localTitles,
      since
    });
    await storageSetSafe({
      leads: mergedLeads,
      searchTitles: mergedTitles,
      supabaseLastSync: new Date().toISOString()
    });
    allLeads = mergedLeads;
    allTitles = mergedTitles;
    renderFilters();
    renderTable();
    setSupaStatus('Synchronisation terminée.', 'success');
  } catch (e) {
    console.error('Supabase sync failed:', e);
    setSupaStatus('Sync Supabase échouée. Réessayez.', 'error');
  }
}

async function importBackupToSupabase(backupData) {
  if (!window?.supabaseSync || !window.supabaseSync.pushChanges) {
    setSupaStatus('Supabase non disponible dans cette page.', 'error');
    return;
  }
  const { supabaseAccessToken } = await storageGetSafe(['supabaseAccessToken']);
  if (!supabaseAccessToken) {
    setSupaStatus('Connectez-vous à Supabase avant d\'importer.', 'error');
    return;
  }

  try {
    let leads = [];
    let searchTitles = [];

    // Si backupData est une string, la parser
    if (typeof backupData === 'string') {
      backupData = JSON.parse(backupData);
    }

    // Extraire les leads et searchTitles du backup
    if (backupData.leads && Array.isArray(backupData.leads)) {
      leads = backupData.leads;
    }
    if (backupData.searchTitles && Array.isArray(backupData.searchTitles)) {
      searchTitles = backupData.searchTitles;
    }

    if (!leads.length && !searchTitles.length) {
      setSupaStatus('Aucune donnée à importer dans le backup.', 'error');
      return;
    }

    setSupaStatus(`Import en cours: ${leads.length} leads, ${searchTitles.length} titres...`, 'info');

    // Pousser les données vers Supabase
    const result = await window.supabaseSync.pushChanges(supabaseAccessToken, {
      leads,
      searchTitles
    });

    // Mettre à jour la dernière sync
    await storageSetSafe({
      supabaseLastSync: new Date().toISOString()
    });

    setSupaStatus(
      `Import réussi: ${result.leads?.length || 0} leads et ${result.searchTitles?.length || 0} titres synchronisés.`,
      'success'
    );

    // Recharger les données locales si nécessaire
    if (leads.length) {
      const currentData = await storageGetSafe(['leads']);
      const currentLeads = currentData.leads || [];
      const mergedLeads = window.supabaseSync.mergeById(currentLeads, leads);
      await storageSetSafe({ leads: mergedLeads });
      allLeads = mergedLeads;
      renderTable();
    }
  } catch (e) {
    console.error('Import backup Supabase failed:', e);
    setSupaStatus(`Erreur lors de l'import: ${e.message}`, 'error');
  }
}
