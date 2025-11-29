# 📋 PLAN DE MISE EN PLACE : Correction Synchronisation Supabase

**Date :** 2025-01-28  
**Objectif :** Corriger l'import automatique vers Supabase

---

## 🎯 OBJECTIF FINAL

**Tous les leads créés ou modifiés doivent être automatiquement synchronisés avec Supabase, sans erreur silencieuse.**

---

## 📊 PROBLÈME IDENTIFIÉ

Le `background.js` appelle une fonction RPC `upsert_lead` qui **n'existe pas** dans le schéma Supabase, ce qui fait échouer toutes les synchronisations depuis `contentScript.js`.

---

## 🔧 SOLUTION PROPOSÉE

**Option retenue :** Utiliser la même méthode que `supabaseSync.js` (POST direct sur `/rest/v1/leads`) au lieu d'une fonction RPC inexistante.

**Avantages :**
- ✅ Pas de modification SQL nécessaire
- ✅ Méthode déjà testée et fonctionnelle
- ✅ Cohérence avec le reste du code

---

## 📝 PLAN D'ACTION DÉTAILLÉ

### ✅ ÉTAPE 1 : Corriger background.js (CRITIQUE)

**Fichier :** `background.js` lignes 275-298

**Action :** Remplacer l'appel RPC inexistant par un POST direct (comme dans supabaseSync.js)

**Avant :**
```javascript
// Utiliser la fonction RPC upsert_lead pour chaque lead
const upsertPromises = leadsWithUserId.map((lead) =>
  fetch(`${SUPABASE_URL}/rest/v1/rpc/upsert_lead`, { // ❌ N'EXISTE PAS
    method: 'POST',
    body: JSON.stringify({ lead_data: lead })
  })
);
```

**Après :**
```javascript
// Utiliser POST direct avec resolution=merge-duplicates (comme supabaseSync.js)
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
      console.error('[LeadTracker] Erreur push leads:', res.status, text);
      throw new Error(`Supabase error ${res.status}: ${text}`);
    }
    return res.json();
  })
);
```

**Impact :** 🔴 CRITIQUE - Débloque toute la synchronisation depuis contentScript

---

### ✅ ÉTAPE 2 : Unifier la conversion des leads

**Fichier :** `background.js` lignes 149-173

**Action :** Utiliser la même logique de conversion que `supabaseSync.js` (gestion des timestamps)

**Problème actuel :** `background.js` a sa propre fonction `convertLeadToSupabase` qui ne gère pas les timestamps numériques.

**Solution :** 
- Option A : Importer/utiliser la fonction de `supabaseSync.js`
- Option B : Répliquer la logique de conversion complète

**Recommandation :** Option A si possible, sinon Option B.

---

### ✅ ÉTAPE 3 : Améliorer la gestion des erreurs

**Fichiers :** `background.js`, `contentScript.js`, `popup.js`, `options.js`

**Actions :**
1. Ajouter des logs détaillés à chaque étape
2. Afficher des notifications en cas d'erreur (toast/badge)
3. Ne pas masquer les erreurs silencieusement

**Exemple de log :**
```javascript
console.log('[LeadTracker] 🔄 Début synchronisation:', {
  leadCount: leads.length,
  hasToken: !!supabaseAccessToken,
  timestamp: new Date().toISOString()
});
```

**Exemple de notification :**
```javascript
if (error) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: '/icons/icon48.png',
    title: 'Erreur Supabase',
    message: `Échec synchronisation: ${error.message}`
  });
}
```

---

### ✅ ÉTAPE 4 : Vérifier que supabaseSync est disponible partout

**Fichiers :** `contentScript.js`, `popup.js`, `options.js`

**Action :** S'assurer que `window.supabaseSync` ou le module est accessible partout où nécessaire.

**Vérifications :**
- ✅ `popup.html` charge `supabaseSync.js`
- ✅ `options.html` charge `supabaseSync.js`
- ⚠️ `contentScript.js` passe par le background (pas de window.supabaseSync direct)

**Solution :** Garder le chemin via background, mais corriger background.js (Étape 1).

---

### ✅ ÉTAPE 5 : Ajouter contrainte UNIQUE sur profile_url

**Fichier :** `schema.sql` ou migration SQL

**Action :** Créer une migration SQL pour ajouter une contrainte unique :

```sql
-- Migration : Ajouter contrainte unique sur profile_url + user_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_user_profile_url 
ON public.leads (user_id, profile_url)
WHERE profile_url IS NOT NULL;

-- Cette contrainte permettra un vrai UPSERT sans doublons
```

**Avantage :** Empêche les doublons, permet un upsert réel.

**Note :** À appliquer dans Supabase directement.

---

### ✅ ÉTAPE 6 : Ajouter un script de diagnostic

**Nouveau fichier :** `diagnoseSync.js` ou fonction dans options.js

**Action :** Créer une fonction de diagnostic accessible depuis la console :

```javascript
async function diagnoseSupabaseSync() {
  console.group('🔍 Diagnostic Synchronisation Supabase');
  
  // 1. Vérifier la configuration
  const { supabaseAccessToken, supabaseMode, supabaseUser } = 
    await chrome.storage.local.get(['supabaseAccessToken', 'supabaseMode', 'supabaseUser']);
  
  console.log('1. Configuration:', {
    token: supabaseAccessToken ? '✅ Présent' : '❌ Absent',
    mode: supabaseMode || 'cloud',
    user: supabaseUser || 'Non défini'
  });
  
  // 2. Vérifier le token
  if (supabaseAccessToken) {
    const userId = getUserIdFromToken(supabaseAccessToken);
    console.log('2. Token JWT:', {
      userId: userId || '❌ Impossible à extraire',
      valid: userId ? '✅ Valide' : '❌ Invalide'
    });
  }
  
  // 3. Tester une requête
  if (supabaseAccessToken) {
    try {
      const testRes = await fetch(`${SUPABASE_URL}/rest/v1/leads?limit=1`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${supabaseAccessToken}`
        }
      });
      console.log('3. Test connexion:', {
        status: testRes.status,
        ok: testRes.ok ? '✅ OK' : '❌ Erreur'
      });
    } catch (e) {
      console.error('3. Test connexion:', '❌ Erreur:', e.message);
    }
  }
  
  // 4. Vérifier les leads locaux
  const { leads } = await chrome.storage.local.get(['leads']);
  console.log('4. Leads locaux:', {
    count: leads?.length || 0
  });
  
  console.groupEnd();
}

// Exposer dans la console
window.diagnoseSupabaseSync = diagnoseSupabaseSync;
```

---

## 🧪 PLAN DE TEST

### Test 1 : Synchronisation depuis ContentScript ✅

**Scénario :**
1. Scanner une page de recherche LinkedIn
2. Capturer 5 leads
3. Vérifier dans Supabase que les 5 leads sont présents

**Critères de succès :**
- ✅ Les 5 leads apparaissent dans Supabase
- ✅ Aucune erreur dans la console
- ✅ Logs montrent "Leads synchronisés: 5"

---

### Test 2 : Synchronisation depuis Popup ✅

**Scénario :**
1. Ouvrir un profil LinkedIn
2. Ajouter le lead manuellement via le popup
3. Vérifier dans Supabase

**Critères de succès :**
- ✅ Le lead apparaît dans Supabase
- ✅ Aucune erreur dans le popup
- ✅ Message de succès affiché

---

### Test 3 : Modification depuis Options ✅

**Scénario :**
1. Modifier un lead existant dans le dashboard
2. Changer le statut "contacté"
3. Vérifier la mise à jour dans Supabase

**Critères de succès :**
- ✅ Le lead est mis à jour dans Supabase
- ✅ Aucune erreur
- ✅ Les changements sont persistés

---

### Test 4 : Gestion des erreurs ✅

**Scénario :**
1. Déconnecter Supabase (supprimer le token)
2. Tenter une synchronisation
3. Vérifier qu'une erreur est affichée (pas silencieuse)

**Critères de succès :**
- ✅ Aucune tentative de synchronisation
- ✅ Message clair que Supabase n'est pas configuré
- ✅ Log dans la console

---

### Test 5 : Mode local ✅

**Scénario :**
1. Activer le mode local (`supabaseMode: 'local'`)
2. Ajouter des leads
3. Vérifier qu'aucune synchronisation n'est tentée

**Critères de succès :**
- ✅ Aucune requête vers Supabase
- ✅ Les leads sont sauvegardés localement uniquement
- ✅ Aucune erreur

---

## 📅 ORDRE D'EXÉCUTION RECOMMANDÉ

### Sprint 1 : Corrections critiques (30 min)

1. ✅ **Étape 1** : Corriger background.js (remplacer RPC par POST)
2. ✅ **Étape 2** : Unifier la conversion des leads
3. ✅ **Test 1** : Vérifier que ça fonctionne

**Objectif :** Débloquer la synchronisation immédiatement

---

### Sprint 2 : Améliorations (1h)

1. ✅ **Étape 3** : Améliorer la gestion des erreurs
2. ✅ **Étape 4** : Vérifier la disponibilité de supabaseSync
3. ✅ **Test 2, 3, 4, 5** : Tests complets

**Objectif :** Rendre la synchronisation robuste

---

### Sprint 3 : Optimisations (optionnel, 1h)

1. ✅ **Étape 5** : Ajouter contrainte UNIQUE (nécessite accès SQL Supabase)
2. ✅ **Étape 6** : Script de diagnostic

**Objectif :** Prévenir les problèmes futurs

---

## 🚨 POINTS D'ATTENTION

### ⚠️ Point 1 : Resolution merge-duplicates

Le header `Prefer: resolution=merge-duplicates` nécessite une contrainte UNIQUE pour fonctionner correctement. Sans cette contrainte, des doublons peuvent être créés.

**Solution immédiate :** Utiliser `resolution=ignore-duplicates` si pas de contrainte.

---

### ⚠️ Point 2 : Gestion des timestamps

Les timestamps numériques (Date.now()) doivent être convertis en ISO strings pour Supabase.

**Vérification :** S'assurer que tous les chemins convertissent correctement.

---

### ⚠️ Point 3 : user_id requis

Tous les leads doivent avoir un `user_id` pour passer la RLS (Row Level Security).

**Vérification :** S'assurer que `getUserIdFromToken` fonctionne correctement.

---

## 📊 MÉTRIQUES DE SUCCÈS

Après mise en place, vérifier :

- ✅ **100% des synchronisations réussies** quand Supabase est configuré
- ✅ **0 erreur silencieuse** - toutes les erreurs sont loggées/affichées
- ✅ **Temps < 2s** pour synchroniser un lead
- ✅ **0 doublon** créé (après ajout de la contrainte UNIQUE)

---

## 🔄 ROLLBACK

Si des problèmes surviennent :

1. **Restaurer** `background.js` à son état précédent
2. **Désactiver** temporairement la synchronisation automatique
3. **Utiliser** uniquement la synchronisation manuelle depuis le dashboard

---

## ✅ CHECKLIST FINALE

- [ ] Étape 1 : background.js corrigé
- [ ] Étape 2 : Conversion unifiée
- [ ] Étape 3 : Gestion d'erreurs améliorée
- [ ] Étape 4 : Vérification supabaseSync
- [ ] Étape 5 : Contrainte UNIQUE ajoutée (optionnel)
- [ ] Étape 6 : Script de diagnostic créé (optionnel)
- [ ] Test 1 : ContentScript OK
- [ ] Test 2 : Popup OK
- [ ] Test 3 : Options OK
- [ ] Test 4 : Erreurs OK
- [ ] Test 5 : Mode local OK

---

**Prochaine action :** Commencer par l'Étape 1 (correction de background.js) - CRITIQUE
