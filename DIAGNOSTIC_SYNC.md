# 🔍 DIAGNOSTIC : Synchronisation Supabase

**Problèmes signalés :**
1. ❌ Rien n'est remonté dans Supabase (synchronisation ne fonctionne pas)
2. ❌ La colonne `company` est vide dans Supabase après import JSON

---

## 🧪 ÉTAPES DE DIAGNOSTIC

### 1. Vérifier la configuration Supabase

**Dans la console du navigateur (F12) :**

```javascript
// Vérifier si Supabase est configuré
chrome.storage.local.get(['supabaseAccessToken', 'supabaseMode', 'supabaseUser'], (result) => {
  console.log('🔍 Configuration Supabase:', {
    token: result.supabaseAccessToken ? '✅ Présent' : '❌ Absent',
    mode: result.supabaseMode || 'cloud',
    user: result.supabaseUser || 'Non défini'
  });
  
  if (result.supabaseAccessToken) {
    // Extraire user_id du token
    const token = result.supabaseAccessToken;
    const parts = token.split('.');
    if (parts.length === 3) {
      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = JSON.parse(atob(base64));
      console.log('User ID:', jsonPayload.sub || jsonPayload.user_id);
    }
  }
});
```

---

### 2. Tester une synchronisation manuelle

**Dans la console du navigateur (F12) :**

```javascript
// Créer un lead de test
const testLead = {
  id: 'test_' + Date.now(),
  name: 'Test Lead',
  headline: 'Test Headline',
  company: 'Test Company',
  profileUrl: 'https://linkedin.com/in/test',
  searchTitle: 'TEST',
  direction: 'outbound_pending',
  createdAt: Date.now(),
  updatedAt: Date.now()
};

// Tester la synchronisation via background
chrome.runtime.sendMessage({
  type: 'PUSH_SUPABASE',
  leads: [testLead]
}, (response) => {
  console.log('Réponse:', response);
});

// Vérifier les logs dans la console du service worker
// Ouvrir chrome://extensions → Détails → Service worker → Console
```

---

### 3. Vérifier les logs du Service Worker

1. Ouvrir `chrome://extensions`
2. Activer "Mode développeur"
3. Trouver votre extension
4. Cliquer sur "Détails"
5. Cliquer sur "Service worker" (ou "Vue de service worker")
6. Ouvrir la console
7. Chercher les logs `[LeadTracker]`

**Logs à chercher :**
- `[LeadTracker] 🔄 Début synchronisation leads`
- `[LeadTracker] ✅ Configuration Supabase`
- `[LeadTracker] ✅ Leads synchronisés`
- `[LeadTracker] ❌ Erreur...`

---

### 4. Vérifier le champ company

**Test de conversion :**

```javascript
// Simuler la conversion d'un lead avec company
const lead = {
  company: 'Test Company',
  profileUrl: 'https://test.com',
  name: 'Test',
  searchTitle: 'TEST'
};

// Fonction de conversion (simplifiée)
const converted = { ...lead };
const mapping = {
  profileUrl: 'profile_url',
  searchTitle: 'search_title'
};

Object.keys(mapping).forEach((camelKey) => {
  if (camelKey in converted) {
    converted[mapping[camelKey]] = converted[camelKey];
    delete converted[camelKey];
  }
});

console.log('Lead converti:', converted);
console.log('Company préservé?', 'company' in converted);
```

---

## 🐛 PROBLÈMES IDENTIFIÉS

### Problème 1 : Champ `company` non préservé

Le champ `company` n'est pas dans le mapping de conversion, donc il devrait être préservé. Mais il se peut qu'il soit perdu quelque part.

**Vérification :** Le champ `company` est en minuscule dans le schéma SQL (`company text`), et il est aussi en minuscule dans les données de l'extension. Il devrait donc être préservé.

---

### Problème 2 : Synchronisation ne fonctionne pas

Plusieurs causes possibles :
1. Le message `PUSH_SUPABASE` n'est pas reçu par le background
2. La fonction `pushToSupabase` échoue silencieusement
3. Le token Supabase n'est pas valide
4. Le mode local est activé

---

## 🔧 SOLUTIONS

### Solution 1 : Ajouter des logs de diagnostic

Ajouter des logs à chaque étape pour identifier où ça bloque.

### Solution 2 : Vérifier le champ company

S'assurer que le champ `company` est bien préservé dans la conversion et envoyé à Supabase.

### Solution 3 : Créer un script de test

Créer un script de test pour vérifier chaque étape de la synchronisation.

---

## 📋 PROCHAINES ÉTAPES

1. Exécuter les diagnostics ci-dessus
2. Vérifier les logs du service worker
3. Tester une synchronisation manuelle
4. Identifier le point de blocage exact
