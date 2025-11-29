# 🔧 ACTIONS IMMÉDIATES : Diagnostic Synchronisation

**Problèmes :**
1. ❌ Rien n'est remonté dans Supabase
2. ❌ Colonne `company` vide dans Supabase

---

## ✅ CORRECTIONS DÉJÀ APPLIQUÉES

1. ✅ Correction de l'appel RPC inexistant dans `background.js`
2. ✅ Amélioration des logs de synchronisation
3. ✅ Vérification que le champ `company` est préservé (✅ Confirmé)

---

## 🎯 ACTIONS IMMÉDIATES À FAIRE

### ACTION 1 : Vérifier la configuration Supabase (2 min)

**Dans la console du navigateur (F12) :**

```javascript
chrome.storage.local.get(['supabaseAccessToken', 'supabaseMode'], (r) => {
  console.log('Token:', r.supabaseAccessToken ? '✅' : '❌');
  console.log('Mode:', r.supabaseMode || 'cloud');
});
```

**Si ❌ :** Connectez-vous dans le Dashboard (options.html)

---

### ACTION 2 : Vérifier les logs du Service Worker (3 min)

1. Ouvrir `chrome://extensions`
2. Trouver votre extension → "Détails"
3. Cliquer sur "Service worker" (ou "Vue de service worker")
4. Ouvrir la console
5. Ajouter un nouveau lead depuis LinkedIn
6. Chercher les logs `[LeadTracker]`

**Logs attendus :**
- `📨 Message PUSH_SUPABASE reçu`
- `✅ Configuration Supabase`
- `🔄 Début synchronisation leads`
- `✅ Leads synchronisés`

**Si aucun log :** Le message n'arrive pas au background

---

### ACTION 3 : Tester une synchronisation manuelle (2 min)

**Dans la console du navigateur (F12) :**

```javascript
const testLead = {
  name: 'Test User',
  company: 'Test Company',
  profileUrl: 'https://linkedin.com/in/test-' + Date.now(),
  searchTitle: 'TEST',
  direction: 'outbound_pending'
};

chrome.runtime.sendMessage({
  type: 'PUSH_SUPABASE',
  leads: [testLead]
}, (r) => console.log('Résultat:', r));
```

**Vérifier :**
1. La réponse dans la console
2. Les logs du Service Worker
3. Si le lead apparaît dans Supabase

---

### ACTION 4 : Vérifier les leads locaux (1 min)

**Dans la console du navigateur (F12) :**

```javascript
chrome.storage.local.get(['leads'], (r) => {
  const leads = r.leads || [];
  const avecCompany = leads.filter(l => l.company && l.company.trim());
  console.log('Leads avec company:', avecCompany.length, '/', leads.length);
  if (avecCompany.length > 0) {
    console.log('Exemple:', avecCompany[0].company);
  }
});
```

**Si 0 leads avec company :** Les données locales n'ont pas de champ `company`

---

## 🔍 RÉSULTATS ATTENDUS

### Si tout fonctionne :

**Console navigateur :**
```
[LeadTracker] 🔄 Tentative synchronisation: {...}
[LeadTracker] ✅ Supabase configuré, envoi des leads au background...
[LeadTracker] ✅ Synchronisation réussie (réponse du background)
```

**Console Service Worker :**
```
[LeadTracker] 📨 Message PUSH_SUPABASE reçu: {...}
[LeadTracker] ✅ Configuration Supabase: {...}
[LeadTracker] 🔄 Début synchronisation leads: {...}
[LeadTracker] ✅ Leads synchronisés: {...}
```

**Supabase :** Le lead apparaît avec le champ `company` rempli

---

### Si ça ne fonctionne pas :

**Identifier où ça bloque :**
- ❌ Pas de log "Tentative synchronisation" → Fonction pas appelée
- ⏭️ Log "Mode local" → Mode local activé
- 📨 Log "Message reçu" mais erreur après → Problème dans pushToSupabase
- ❌ Erreur spécifique → Voir les détails dans les logs

---

## 📋 PROCHAINES ÉTAPES SELON LES RÉSULTATS

### Scénario A : Token absent ou mode local

**Solution :** Connecter Supabase dans le Dashboard

---

### Scénario B : Message pas reçu par le background

**Solution :** Vérifier que le service worker est actif, recharger l'extension

---

### Scénario C : Erreur lors de la synchronisation

**Solution :** Vérifier l'erreur exacte dans les logs et corriger

---

### Scénario D : Leads synchronisés mais company vide

**Solution :** Vérifier que les leads locaux ont bien un champ `company`

---

**Commencez par l'ACTION 1 et partagez les résultats !** 🔍
