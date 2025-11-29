/**
 * Minimal Supabase sync helper (sans supabase-js) pour extension MV3.
 * Utilise les endpoints REST et Auth. RLS protège les lignes par user_id.
 *
 * Points clés :
 * - Ne jamais embarquer de clé service_role dans l'extension.
 * - L'utilisateur doit s'authentifier (email/password ou magic link) pour obtenir un access_token.
 * - Les appels utilisent Authorization: Bearer <access_token> + apikey (anon).
 */

const SUPABASE_URL = 'https://hcahvwbzgyeqkamephzn.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjYWh2d2J6Z3llcWthbWVwaHpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNjYyNDgsImV4cCI6MjA3OTc0MjI0OH0.wZu336fqjSTbCipcaVvni-MKT9iXB9uaO28gm8a5B-Y';

const defaultHeaders = {
  apikey: SUPABASE_ANON_KEY,
  'Content-Type': 'application/json'
};

function authHeaders(accessToken) {
  return {
    ...defaultHeaders,
    Authorization: `Bearer ${accessToken}`
  };
}

async function handleResponse(res) {
  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_) {
    payload = text;
  }
  if (!res.ok) {
    const message = payload?.message || payload?.error_description || payload?.error || res.statusText;
    const error = new Error(`Supabase error ${res.status}: ${message}`);
    error.status = res.status;
    error.response = payload;
    error.responseText = text;
    throw error;
  }
  return payload;
}

async function signUpWithPassword(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify({ email, password })
  });
  return handleResponse(res);
}

async function signInWithPassword(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify({ email, password })
  });
  return handleResponse(res);
}

async function sendMagicLink(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/magiclink`, {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify({ email })
  });
  return handleResponse(res);
}

// Mapping camelCase (extension) ↔ snake_case (Supabase)
function toSnakeCase(str) {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function convertLeadToSupabase(lead) {
  if (!lead) return lead;
  const converted = { ...lead };
  // Convertir les clés camelCase en snake_case
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
  
  // Ne pas envoyer l'ID si ce n'est pas un UUID (Supabase génère les UUIDs)
  // Les IDs locaux comme "1763817835094_54dio3b78kq" ne sont pas valides
  if (converted.id && !converted.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    delete converted.id;
  }
  
  return converted;
}

function convertLeadFromSupabase(lead) {
  if (!lead) return lead;
  const converted = { ...lead };
  // Convertir les clés snake_case en camelCase
  const mapping = {
    profile_url: 'profileUrl',
    search_title: 'searchTitle',
    request_date: 'requestDate',
    acceptance_date: 'acceptanceDate',
    contacted_date: 'contactedDate',
    conversion_date: 'conversionDate',
    top_lead: 'topLead',
    employee_range: 'employeeRange',
    company_segment: 'companySegment',
    company_industry: 'companyIndustry',
    created_at: 'createdAt',
    updated_at: 'updatedAt'
  };
  Object.keys(mapping).forEach((snakeKey) => {
    if (snakeKey in converted) {
      converted[mapping[snakeKey]] = converted[snakeKey];
      delete converted[snakeKey];
    }
  });
  return converted;
}

function convertSearchTitleToSupabase(title) {
  if (!title || !title.label) return null;
  
  // Créer un objet normalisé avec uniquement les clés requises
  // Ne pas inclure created_at/updated_at - Supabase les gère automatiquement avec les defaults
  // Ne pas inclure id - Supabase génère les UUIDs automatiquement
  // user_id sera ajouté dans la fonction upsert depuis le token
  return {
    label: String(title.label).trim()
  };
}

// Extraire user_id depuis le token JWT
function getUserIdFromToken(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(jsonPayload);
    return payload.sub || payload.user_id || null;
  } catch (e) {
    return null;
  }
}

async function upsert(table, rows, accessToken) {
  if (!Array.isArray(rows) || !rows.length) return [];
  
  // Extraire user_id du token pour les tables qui en ont besoin
  const userId = getUserIdFromToken(accessToken);
  
  // Convertir les leads ou searchTitles en format Supabase (snake_case)
  let convertedRows;
  if (table === 'leads') {
    convertedRows = rows.map(convertLeadToSupabase);
    // Ajouter user_id à chaque lead si nécessaire
    if (userId) {
      convertedRows = convertedRows.map(row => ({ ...row, user_id: userId }));
    }
  } else if (table === 'search_titles') {
    // Convertir et filtrer les nulls
    convertedRows = rows.map(convertSearchTitleToSupabase).filter(row => row !== null);
    // Ajouter user_id à chaque search_title (requis par le schéma)
    // Normaliser pour que tous aient exactement les mêmes clés
    if (userId) {
      convertedRows = convertedRows.map(row => ({ 
        label: row.label,
        user_id: userId 
      }));
    } else {
      // Même sans userId, normaliser les clés
      convertedRows = convertedRows.map(row => ({ label: row.label }));
    }
  } else {
    convertedRows = rows;
  }
  
  // Vérifier que tous les objets ont les mêmes clés
  if (convertedRows.length > 0) {
    const firstKeys = Object.keys(convertedRows[0]).sort().join(',');
    const allSameKeys = convertedRows.every(row => 
      Object.keys(row).sort().join(',') === firstKeys
    );
    if (!allSameKeys) {
      console.warn(`[Supabase] Warning: Objects in ${table} have different keys. First:`, firstKeys);
      // Normaliser tous les objets pour avoir les mêmes clés
      const allKeys = new Set();
      convertedRows.forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));
      convertedRows = convertedRows.map(row => {
        const normalized = {};
        allKeys.forEach(key => {
          // Ne pas inclure les valeurs null/undefined (Supabase utilise les defaults)
          if (row[key] !== null && row[key] !== undefined) {
            let value = row[key];
            // Convertir les timestamps numériques en ISO strings pour les champs de date
            if ((key === 'created_at' || key === 'updated_at') && typeof value === 'number') {
              value = new Date(value).toISOString();
            }
            normalized[key] = value;
          }
        });
        return normalized;
      });
      
      // Re-normaliser pour garantir que tous ont les mêmes clés
      // Utiliser seulement les clés présentes dans tous les objets
      const keysInAll = Array.from(allKeys).filter(key => 
        convertedRows.every(row => key in row)
      );
      if (keysInAll.length > 0) {
        convertedRows = convertedRows.map(row => {
          const normalized = {};
          keysInAll.forEach(key => normalized[key] = row[key]);
          return normalized;
        });
      }
    }
  }
  
  // Conversion finale de tous les timestamps numériques en ISO strings
  convertedRows = convertedRows.map(row => {
    const cleaned = { ...row };
    // Convertir tous les champs de timestamp qui sont des nombres
    Object.keys(cleaned).forEach(key => {
      if ((key === 'created_at' || key === 'updated_at') && typeof cleaned[key] === 'number') {
        cleaned[key] = new Date(cleaned[key]).toISOString();
      }
    });
    return cleaned;
  });
  
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      ...authHeaders(accessToken),
      Prefer: 'return=representation,resolution=merge-duplicates'
    },
    body: JSON.stringify(convertedRows)
  });
  const result = await handleResponse(res);
  // Convertir les résultats en format extension (camelCase) pour les leads
  return table === 'leads' && Array.isArray(result)
    ? result.map(convertLeadFromSupabase)
    : result;
}

function buildSinceParam(since) {
  if (!since) return null;
  // since attendu ISO string (ex: 2024-12-01T10:00:00Z)
  return `gt.${since}`;
}

async function fetchTable(table, accessToken, { since, order = 'updated_at.desc', limit = 1000 } = {}) {
  const params = new URLSearchParams();
  params.set('select', '*');
  if (since) params.set('updated_at', buildSinceParam(since));
  if (order) params.set('order', order);
  if (limit) params.set('limit', String(limit));
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`, {
    headers: authHeaders(accessToken)
  });
  const result = await handleResponse(res);
  // Convertir les leads de Supabase (snake_case) vers l'extension (camelCase)
  return table === 'leads' && Array.isArray(result)
    ? result.map(convertLeadFromSupabase)
    : result;
}

async function fetchChanges(accessToken, { since } = {}) {
  const [leads, searchTitles] = await Promise.all([
    fetchTable('leads', accessToken, { since }),
    fetchTable('search_titles', accessToken, { since })
  ]);
  // Convertir les leads de Supabase (snake_case) vers l'extension (camelCase)
  const convertedLeads = Array.isArray(leads) 
    ? leads.map(convertLeadFromSupabase)
    : leads;
  return { leads: convertedLeads, searchTitles };
}

async function pushChanges(accessToken, { leads = [], searchTitles = [], events = [] } = {}) {
  const results = {};
  if (searchTitles.length) {
    results.searchTitles = await upsert('search_titles', searchTitles, accessToken);
  }
  if (leads.length) {
    results.leads = await upsert('leads', leads, accessToken);
  }
  if (events.length) {
    results.events = await upsert('lead_events', events, accessToken);
  }
  return results;
}

function mergeById(localItems = [], remoteItems = []) {
  const map = new Map();
  [...localItems, ...remoteItems].forEach((item) => {
    const existing = map.get(item.id);
    // Comparer avec updatedAt (camelCase) ou updated_at (snake_case)
    const itemUpdated = item.updatedAt || item.updated_at;
    const existingUpdated = existing?.updatedAt || existing?.updated_at;
    if (!existing || (itemUpdated && existingUpdated && itemUpdated > existingUpdated)) {
      map.set(item.id, item);
    }
  });
  return Array.from(map.values());
}

async function syncAll(accessToken, { localLeads = [], localTitles = [], since = null } = {}) {
  const remote = await fetchChanges(accessToken, { since });
  const mergedLeads = mergeById(localLeads, remote.leads || []);
  const mergedTitles = mergeById(localTitles, remote.searchTitles || []);
  const pushResult = await pushChanges(accessToken, {
    leads: mergedLeads,
    searchTitles: mergedTitles
  });
  return { mergedLeads, mergedTitles, pushResult };
}

// UMD export: attach to window or CommonJS
const supabaseSync = {
  signUpWithPassword,
  signInWithPassword,
  sendMagicLink,
  fetchChanges,
  pushChanges,
  mergeById,
  syncAll,
  convertLeadToSupabase,
  convertLeadFromSupabase
};

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = supabaseSync;
} else if (typeof window !== 'undefined') {
  window.supabaseSync = supabaseSync;
}
