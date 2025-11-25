function formatNumber(n = 0) {
  return new Intl.NumberFormat('fr-FR').format(n);
}

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

const PIE_COLORS_CONST =
  window?.PIE_COLORS && Array.isArray(window.PIE_COLORS) && window.PIE_COLORS.length
    ? window.PIE_COLORS
    : ['#0ea5e9', '#22c55e', '#a855f7', '#f59e0b'];
const storageGetSafe = window?.storageGet || ((keys) => chrome.storage.local.get(keys));

function setFeedback(message, type = 'info') {
  const box = document.getElementById('metricsFeedback');
  if (!box) return;
  box.classList.remove('hidden', 'success', 'error', 'info');
  box.classList.add(type);
  box.textContent = message;
  if (!message) box.classList.add('hidden');
}

function renderSummaryCards(stats) {
  const container = document.getElementById('summaryCards');
  if (!container) return;
  const cards = [
    { label: 'Leads total', value: stats.total },
    { label: 'Contactés', value: stats.contacted },
    { label: 'À contacter', value: stats.toContact },
    { label: 'Demandes en attente', value: stats.pending },
    { label: 'Inbound', value: stats.inbound },
    { label: 'Outbound', value: stats.outbound }
  ];
  const filtered = cards.filter((c) => c.value > 0);
  if (filtered.length === 0) {
    container.innerHTML = '<div class="muted small">Aucune donnée à afficher pour le moment.</div>';
    return;
  }
  container.innerHTML = filtered
    .map(
      (c) => `
    <div class="metric-card tone-unified">
      <div class="metric-label">${c.label}</div>
      <div class="metric-value">${formatNumber(c.value)}</div>
    </div>
  `
    )
    .join('');
}

function aggregateStats(leads) {
  const stats = {
    total: leads.length,
    contacted: 0,
    toContact: 0,
    pending: 0,
    inbound: 0,
    outbound: 0
  };
  leads.forEach((l) => {
    if (l.contacted) stats.contacted += 1;
    if (!l.contacted && l.acceptanceDate) stats.toContact += 1;
    if (l.direction === 'outbound_pending') stats.pending += 1;
    if (l.direction === 'inbound_accepted') stats.inbound += 1;
    if (l.direction === 'outbound_accepted' || l.direction === 'outbound_pending')
      stats.outbound += 1;
  });
  return stats;
}

function aggregateTimeline(leads) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 29);

  const counts = new Map();
  leads.forEach((l) => {
    if (!l.createdAt) return;
    const d = new Date(l.createdAt);
    d.setHours(0, 0, 0, 0);
    if (d < cutoff) return;
    const key = d.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const days = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(cutoff);
    d.setDate(cutoff.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    days.push({ label: key, count: counts.get(key) || 0 });
  }
  return days;
}

function uniqueCompanies(leads, selectedTitle = 'all') {
  const set = new Set();
  leads.forEach((l) => {
    const title = (l.searchTitle || '').trim();
    if (selectedTitle !== 'all' && title !== selectedTitle) return;
    const c = (l.company || deriveCompanyFromHeadline(l.headline) || '').trim();
    if (c) set.add(c);
  });
  return Array.from(set).sort();
}

function uniqueTitles(leads, selectedCompany = 'all') {
  const set = new Set();
  leads.forEach((l) => {
    const company = (l.company || deriveCompanyFromHeadline(l.headline) || '').trim();
    if (selectedCompany !== 'all' && company !== selectedCompany) return;
    const t = (l.searchTitle || '').trim();
    if (t) set.add(t);
  });
  return Array.from(set).sort();
}

function renderTimeline(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="muted small">Aucune donnée disponible.</div>';
    return;
  }
  const filtered = data.filter((d) => d.count > 0);
  if (!filtered.length) {
    container.innerHTML = '<div class="muted small">Aucune donnée disponible.</div>';
    return;
  }
  const max = Math.max(...filtered.map((i) => i.count), 1);
  container.innerHTML = `
    <div class="bar-grid">
      ${filtered
        .map((item) => {
          const percent = Math.round((item.count / max) * 100);
          const label = item.label.slice(5);
          return `
          <div class="bar-grid-item" title="${item.label} : ${item.count}">
            <div class="bar-grid-value">${item.count}</div>
            <div class="bar-grid-track">
              <div class="bar-grid-fill" style="height:${percent}%;"></div>
            </div>
            <div class="bar-grid-label">${label}</div>
          </div>
        `;
        })
        .join('')}
    </div>
  `;
}

function aggregateTimelineFiltered(leads, predicate) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 29);

  const counts = new Map();
  leads.forEach((l) => {
    if (!predicate(l)) return;
    if (!l.createdAt) return;
    const d = new Date(l.createdAt);
    d.setHours(0, 0, 0, 0);
    if (d < cutoff) return;
    const key = d.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const days = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(cutoff);
    d.setDate(cutoff.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    days.push({ label: key, count: counts.get(key) || 0 });
  }
  return days;
}

function mergeTimelines(barsData, lineData) {
  const map = new Map();
  barsData.forEach((d) => {
    map.set(d.label, { label: d.label, a: d.count, b: 0 });
  });
  lineData.forEach((d) => {
    const entry = map.get(d.label) || { label: d.label, a: 0, b: 0 };
    entry.b = d.count;
    map.set(d.label, entry);
  });
  return Array.from(map.values()).sort((x, y) => x.label.localeCompare(y.label));
}

function renderDualBars(containerId, rows) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!rows || !rows.length) {
    container.innerHTML = '<div class="muted small">Aucune donnée disponible.</div>';
    return;
  }
  const filtered = rows.filter((d) => d.a > 0 || d.b > 0);
  if (!filtered.length) {
    container.innerHTML = '<div class="muted small">Aucune donnée disponible.</div>';
    return;
  }
  const max = Math.max(...filtered.map((b) => b.a), ...filtered.map((b) => b.b), 1);

  container.innerHTML = `
    <div class="barline-chart">
      <div class="barline-bars">
        ${filtered
          .map((item) => {
            const h = Math.round((item.a / max) * 100);
            const label = item.label.slice(5);
            const tooltip = `${item.label} — Entreprises : ${item.a} · Titres : ${item.b}`;
            return `
            <div class="barline-item" title="${tooltip}">
              <div class="barline-pair">
                <div class="barline-bar primary" style="height:${h}%"></div>
                <div class="barline-bar secondary" style="height:${Math.round((item.b / max) * 100)}%"></div>
              </div>
              <div class="barline-x">${label}</div>
            </div>
          `;
          })
          .join('')}
      </div>
    </div>
    <div class="stack-legend">
      <span class="legend-dot" style="background:#0a66c2"></span>Entreprises ·
      <span class="legend-dot" style="background:#22c55e"></span>Titres
    </div>
  `;
}

function renderPie(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="muted small">Aucune donnée disponible.</div>';
    return;
  }
  const filtered = items.filter((i) => i.count > 0);
  if (!filtered.length) {
    container.innerHTML = '<div class="muted small">Aucune donnée disponible.</div>';
    return;
  }
  const total = filtered.reduce((sum, it) => sum + it.count, 0);
  if (!total) {
    container.innerHTML = '<div class="muted small">Aucune donnée disponible.</div>';
    return;
  }
  let cumulative = 0;
  const slices = filtered
    .map((item, idx) => {
      const start = cumulative / total;
      cumulative += item.count;
      const end = cumulative / total;
      const largeArc = end - start > 0.5 ? 1 : 0;
      const startX = Math.cos(2 * Math.PI * start);
      const startY = Math.sin(2 * Math.PI * start);
      const endX = Math.cos(2 * Math.PI * end);
      const endY = Math.sin(2 * Math.PI * end);
      const color = PIE_COLORS_CONST[idx % PIE_COLORS_CONST.length];
      return `<path d="M0 0 L ${startX} ${startY} A 1 1 0 ${largeArc} 1 ${endX} ${endY} Z" fill="${color}" data-label="${item.label}" data-value="${item.count}"></path>`;
    })
    .join('');

  container.innerHTML = `
    <svg viewBox="-1 -1 2 2" class="pie-chart" role="img">
      ${slices}
    </svg>
  `;
}

function renderPieLegend(items) {
  const legend = document.getElementById('pieLegend');
  if (!legend) return;
  if (!items || items.length === 0) {
    legend.innerHTML = '';
    return;
  }
  const filtered = items.filter((i) => i.count > 0);
  if (!filtered.length) {
    legend.innerHTML = '';
    return;
  }
  const total = filtered.reduce((sum, it) => sum + it.count, 0);
  legend.innerHTML = filtered
    .map((item, idx) => {
      const color = PIE_COLORS_CONST[idx % PIE_COLORS_CONST.length];
      const pct = total ? Math.round((item.count / total) * 100) : 0;
      return `<span class="legend-item"><span class="legend-dot" style="background:${color}"></span>${item.label} (${pct}%)</span>`;
    })
    .join(' · ');
}

async function init() {
  try {
    const data = await storageGetSafe(['leads']);
    const leads = data.leads || [];
    if (!leads.length) {
      setFeedback('Aucun lead à afficher pour le moment.', 'info');
    }

    const stats = aggregateStats(leads);
    renderSummaryCards(stats);

    const companies = Array.from(
      new Set(
        leads
          .map((l) => (l.company || deriveCompanyFromHeadline(l.headline) || '').trim())
          .filter(Boolean)
      )
    ).sort();
    const titles = Array.from(
      new Set(leads.map((l) => (l.searchTitle || '').trim()).filter(Boolean))
    ).sort();

    const companySelect = document.getElementById('companySelect');
    const titleSelect = document.getElementById('titleSelect');

    const populateCompanyOptions = (selectedTitle) => {
      if (!companySelect) return;
      const opts = uniqueCompanies(leads, selectedTitle);
      const current = companySelect.value || 'all';
      companySelect.innerHTML =
        '<option value="all">Toutes les entreprises</option>' +
        opts.map((c) => `<option value="${c}">${c}</option>`).join('');
      if (current !== 'all' && !opts.includes(current)) {
        companySelect.value = 'all';
      } else {
        companySelect.value = current;
      }
    };

    const populateTitleOptions = (selectedCompany) => {
      if (!titleSelect) return;
      const opts = uniqueTitles(leads, selectedCompany);
      const current = titleSelect.value || 'all';
      titleSelect.innerHTML =
        '<option value="all">Tous les titres</option>' +
        opts.map((t) => `<option value="${t}">${t}</option>`).join('');
      if (current !== 'all' && !opts.includes(current)) {
        titleSelect.value = 'all';
      } else {
        titleSelect.value = current;
      }
    };

    populateCompanyOptions('all');
    populateTitleOptions('all');

    const applyComparisonChart = () => {
      const selectedCompany = companySelect?.value || 'all';
      const selectedTitle = titleSelect?.value || 'all';

      const barsData = aggregateTimelineFiltered(leads, (l) => {
        const company = (l.company || deriveCompanyFromHeadline(l.headline) || '').trim();
        const title = (l.searchTitle || '').trim();
        if (selectedCompany !== 'all' && company !== selectedCompany) return false;
        if (selectedTitle !== 'all' && title !== selectedTitle) return false;
        return true;
      });

      const lineData = aggregateTimelineFiltered(leads, (l) => {
        const company = (l.company || deriveCompanyFromHeadline(l.headline) || '').trim();
        const title = (l.searchTitle || '').trim();
        if (selectedCompany !== 'all' && company !== selectedCompany) return false;
        if (selectedTitle !== 'all' && title !== selectedTitle) return false;
        return true;
      });

      const merged = mergeTimelines(barsData, lineData);
      renderDualBars('chartDimension', merged);
    };
    applyComparisonChart();
    companySelect?.addEventListener('change', () => {
      populateTitleOptions(companySelect.value || 'all');
      applyComparisonChart();
    });
    titleSelect?.addEventListener('change', () => {
      populateCompanyOptions(titleSelect.value || 'all');
      applyComparisonChart();
    });

    const btnResetFilters = document.getElementById('btnResetFilters');
    if (btnResetFilters) {
      btnResetFilters.addEventListener('click', () => {
        if (companySelect) {
          companySelect.value = 'all';
        }
        if (titleSelect) {
          titleSelect.value = 'all';
        }
        populateCompanyOptions('all');
        populateTitleOptions('all');
        applyComparisonChart();
      });
    }

    const directions = [
      {
        label: 'Outbound (en attente)',
        count: leads.filter((l) => l.direction === 'outbound_pending').length
      },
      {
        label: 'Outbound (acceptée)',
        count: leads.filter((l) => l.direction === 'outbound_accepted').length
      },
      { label: 'Inbound', count: leads.filter((l) => l.direction === 'inbound_accepted').length }
    ].filter((it) => it.count > 0);
    renderPie('chartDirection', directions);
    renderPieLegend(directions);

    const timeline = aggregateTimeline(leads);
    renderTimeline('chartTimeline', timeline);
  } catch (e) {
    console.error('Erreur chargement metrics:', e);
    setFeedback('Impossible de charger les metrics.', 'error');
  }

  const btnBack = document.getElementById('btnBackDashboard');
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      window.location.href = 'options.html';
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
