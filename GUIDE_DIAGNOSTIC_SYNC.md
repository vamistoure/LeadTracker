# 🔍 GUIDE DE DIAGNOSTIC : Synchronisation Supabase

**Problèmes signalés :**
- ❌ Rien n'est remonté dans Supabase
- ❌ La colonne `company` est vide après import JSON

---

## 🔧 DIAGNOSTIC ÉTAPE PAR ÉTAPE

### ÉTAPE 1 : Vérifier la configuration Supabase

**Ouvrir la console du navigateur (F12) et exécuter :**

```javascript
chrome.storage.local.get(['supabaseAccessToken', 'supabaseMode', 'supabaseUser'], (result) => {
  console.log('🔍 DIAGNOSTIC Supabase:', {
    token: result.supabaseAccessToken ? '✅ Présent' : '❌ Absent',
    mode: result.supabaseMode || 'cloud',
    user: result.supabaseUser || 'Non défini',
    email: result.supabaseUser?.email || 'Non défini'
  });
  
  if (!result.supabaseAccessToken) {
    console.warn('❌ PROBLÈME: Pas de token Supabase. Connectez-vous dans le Dashboard.');
  }
  
  if (result.supabaseMode === 'local') {
    console.warn('⚠️ Mode local activé - la synchronisation est désactivée');
  }
});
```

**Si le token est absent :** Connectez-vous dans le Dashboard (options.html)

---

### ÉTAPE 2 : Vérifier les logs de synchronisation

#### A. Dans la console du Content Script

**Ouvrir la console du navigateur (F12) sur une page LinkedIn**

Chercher ces logs quand vous ajoutez un lead :
- `[LeadTracker] 🔄 Tentative synchronisation:`
- `[LeadTracker] ✅ Supabase configuré, envoi des leads au background...`
- `[LeadTracker] ✅ Synchronisation réussie`
- OU `[LeadTracker] ⏭️ Mode local ou Supabase non configuré`

#### B. Dans la console du Service Worker

**Ouvrir `chrome://extensions` → Détails → Service worker → Console**

Chercher ces logs :
- `[LeadTracker] 📨 Message PUSH_SUPABASE reçu:`
- `[LeadTracker] ✅ Configuration Supabase:`
- `[LeadTracker] 🔄 Début synchronisation leads:`
- `[LeadTracker] ✅ Leads synchronisés:`
- `[LeadTracker] ✅ Synchronisation Supabase réussie:`
- OU `[LeadTracker] ❌ Erreur...`

---

### ÉTAPE 3 : Tester une synchronisation manuelle

**Dans la console du navigateur (F12) :**

```javascript
// Créer un lead de test avec company
const testLead = {
  id: 'test_' + Date.now(),
  name: 'Test User',
  headline: 'Test Headline',
  company: 'Test Company',
  profileUrl: 'https://linkedin.com/in/test-' + Date.now(),
  searchTitle: 'TEST',
  direction: 'outbound_pending',
  createdAt: Date.now(),
  updatedAt: Date.now()
};

// Envoyer au background
chrome.runtime.sendMessage({
  type: 'PUSH_SUPABASE',
  leads: [testLead]
}, (response) => {
  console.log('Réponse background:', response);
  if (chrome.runtime.lastError) {
    console.error('Erreur:', chrome.runtime.lastError.message);
  }
});
```

**Vérifier ensuite :**
1. Les logs dans la console du service worker
2. Si le lead apparaît dans Supabase
3. Si le champ `company` est présent

---

### ÉTAPE 4 : Vérifier le champ company dans les données locales

**Dans la console du navigateur (F12) :**

```javascript
chrome.storage.local.get(['leads'], (result) => {
  const leads = result.leads || [];
  console.log('📊 Analyse des leads locaux:');
  console.log('   Total:', leads.length);
  
  const leadsWithCompany = leads.filter(l => l.company && l.company.trim());
  const leadsWithoutCompany = leads.filter(l => !l.company || !l.company.trim());
  
  console.log('   Avec company:', leadsWithCompany.length);
  console.log('   Sans company:', leadsWithoutCompany.length);
  
  if (leadsWithoutCompany.length > 0) {
    console.log('\n   Exemples de leads sans company:');
    leadsWithoutCompany.slice(0, 3).forEach(l => {
      console.log('   -', l.name, '| Profile:', l.profileUrl);
    });
  }
  
  if (leadsWithCompany.length > 0) {
    console.log('\n   Exemples de leads avec company:');
    leadsWithCompany.slice(0, 3).forEach(l => {
      console.log('   -', l.name, '| Company:', l.company);
    });
  }
});
```

---

## 🐛 PROBLÈMES COURANTS ET SOLUTIONS

### Problème 1 : "Pas de token Supabase"

**Symptôme :** Log `[LeadTracker] ⏭️ Mode local ou Supabase non configuré`

**Solution :**
1. Ouvrir le Dashboard (options.html)
2. Section Supabase en bas
3. Se connecter avec email/password ou token
4. Vérifier que le statut affiche "Connecté"

---

### Problème 2 : "Leads synchronisés mais company vide"

**Causes possibles :**
1. Les leads locaux n'ont pas de champ `company` (vérifier avec ÉTAPE 4)
2. Le champ `company` est vide dans les données sources

**Solution :**
- Vérifier que les leads dans `chrome.storage.local` ont bien un champ `company`
- Si non, les données ont été créées sans ce champ

---

### Problème 3 : "Message PUSH_SUPABASE reçu mais erreur après"

**Symptôme :** Log `[LeadTracker] 📨 Message PUSH_SUPABASE reçu` mais ensuite erreur

**Vérifications :**
1. Token valide (voir ÉTAPE 1)
2. user_id extrait correctement du token
3. Erreur spécifique dans les logs

**Actions :**
- Regarder les logs détaillés dans la console du service worker
- Vérifier l'erreur exacte affichée

---

### Problème 4 : "Aucun log visible"

**Causes possibles :**
1. Le service worker n'est pas actif
2. Les logs sont dans une autre console
3. La synchronisation n'est pas déclenchée

**Solution :**
1. Recharger l'extension dans `chrome://extensions`
2. Vérifier la console du service worker ET la console du navigateur
3. Tester une synchronisation manuelle (ÉTAPE 3)

---

## 📋 CHECKLIST DE DIAGNOSTIC

- [ ] ÉTAPE 1 : Token Supabase présent ?
- [ ] ÉTAPE 1 : Mode local non activé ?
- [ ] ÉTAPE 2 : Logs visibles dans console Content Script ?
- [ ] ÉTAPE 2 : Logs visibles dans console Service Worker ?
- [ ] ÉTAPE 3 : Test manuel fonctionne ?
- [ ] ÉTAPE 4 : Leads locaux ont un champ `company` ?

---

## 🔍 LOGS À CHERCHER

### Dans la console du navigateur (Content Script) :

```
✅ [LeadTracker] 🔄 Tentative synchronisation: {...}
✅ [LeadTracker] ✅ Supabase configuré, envoi des leads au background...
✅ [LeadTracker] ✅ Synchronisation réussie (réponse du background)
❌ [LeadTracker] ⏭️ Mode local ou Supabase non configuré
❌ [LeadTracker] ❌ Erreur envoi message Supabase: ...
```

### Dans la console du Service Worker :

```
✅ [LeadTracker] 📨 Message PUSH_SUPABASE reçu: {...}
✅ [LeadTracker] ✅ Configuration Supabase: {...}
✅ [LeadTracker] 🔄 Début synchronisation leads: {...}
✅ [LeadTracker] ✅ Leads synchronisés: {...}
✅ [LeadTracker] ✅ Synchronisation Supabase réussie: {...}
❌ [LeadTracker] ❌ Erreur push leads: {...}
❌ [LeadTracker] ❌ PUSH_SUPABASE failed: {...}
```

---

## 💡 PROCHAINES ACTIONS

1. **Exécuter ÉTAPE 1** pour vérifier la configuration
2. **Exécuter ÉTAPE 4** pour vérifier les données locales
3. **Exécuter ÉTAPE 3** pour tester une synchronisation manuelle
4. **Vérifier les logs** selon ÉTAPE 2
5. **Partager les résultats** pour identifier le problème exact

---

## 📞 SUPPORT

Si le problème persiste, partager :
- Les résultats de l'ÉTAPE 1
- Les logs de l'ÉTAPE 2 (Service Worker)
- Le résultat de l'ÉTAPE 3
- Le résultat de l'ÉTAPE 4

Cela permettra d'identifier précisément où ça bloque.
