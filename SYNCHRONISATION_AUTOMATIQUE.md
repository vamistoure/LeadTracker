# Synchronisation Automatique avec Supabase

## 🎯 Solution Pérenne

La synchronisation automatique avec Supabase est maintenant **intelligente** et **transparente**. Elle fonctionne de manière différente selon votre configuration :

### 🔹 Mode Local (sans Supabase)
- **Comportement** : Les leads sont sauvegardés uniquement localement dans `chrome.storage.local`
- **Avantage** : Pas besoin de compte, fonctionnement instantané
- **Limitation** : Données uniquement sur cet appareil/navigateur

### 🔹 Mode Cloud (avec Supabase)
- **Comportement** : Les leads sont automatiquement synchronisés avec Supabase à chaque création/modification
- **Avantage** : Données disponibles partout, sauvegarde automatique
- **Requis** : Compte Supabase configuré dans l'extension

---

## 🔧 Fonctionnement Technique

### Détection Automatique

L'extension vérifie automatiquement si Supabase est configuré avant chaque synchronisation :

```javascript
// La fonction isSupabaseConfigured() vérifie :
1. Si supabaseMode === 'local' → Mode local activé → Pas de sync
2. Si supabaseAccessToken existe → Mode cloud → Synchronisation automatique
3. Sinon → Mode local par défaut
```

### Points de Synchronisation

Les leads sont automatiquement synchronisés avec Supabase dans ces situations :

#### ✅ Capture depuis LinkedIn
- Scan de page de recherche LinkedIn
- Capture automatique depuis un profil
- Clic sur "Connect" avec capture

#### ✅ Modifications depuis le Popup
- Ajout manuel d'un lead
- Mise à jour d'un lead existant
- Application de suggestions d'amélioration

#### ✅ Modifications depuis le Dashboard (options.html)
- Mise à jour des détails d'un lead
- Changement du statut "contacté"
- Changement du statut "top lead"
- Marquage comme accepté

#### ✅ Détections Automatiques
- Détection de connexion acceptée
- Backfill automatique des informations manquantes

---

## 📋 Configuration

### Activer le Mode Cloud

1. **Ouvrir le Dashboard** : Cliquez sur l'icône de l'extension → "Dashboard"
2. **Section Supabase** : En bas de la page
3. **Connexion** :
   - Email + Mot de passe
   - OU Token d'accès (pour compte GitHub OAuth)
4. **Vérification** : Le statut affiche "Connecté en tant que..."

### Mode Local

Le mode local est activé par défaut si :
- Aucune connexion Supabase n'a été faite
- Ou vous avez explicitement choisi "Mode local" lors de l'onboarding

---

## 🔍 Vérification

### Vérifier si Supabase est configuré

**Dans la console du navigateur** (F12) :

```javascript
// Méthode 1 : Via chrome.storage
chrome.storage.local.get(['supabaseAccessToken', 'supabaseMode'], (result) => {
  console.log('Token:', result.supabaseAccessToken ? '✅ Présent' : '❌ Absent');
  console.log('Mode:', result.supabaseMode || 'cloud');
});

// Méthode 2 : Via la page getToken.html
// Ouvrez : chrome-extension://[ID]/getToken.html
// Cette page affiche directement votre statut
```

### Vérifier les synchronisations

**Dans la console du navigateur** :

```javascript
// Les logs montrent les synchronisations réussies
[LeadTracker] Lead synchronisé avec Supabase: [ID]
[LeadTracker] 5 leads synchronisés avec Supabase
```

---

## 🐛 Dépannage

### Les leads ne se synchronisent pas

1. **Vérifier la connexion Supabase** :
   ```javascript
   chrome.storage.local.get(['supabaseAccessToken'], (r) => {
     console.log('Token:', r.supabaseAccessToken ? 'OK' : 'MANQUANT');
   });
   ```

2. **Vérifier le mode** :
   ```javascript
   chrome.storage.local.get(['supabaseMode'], (r) => {
     if (r.supabaseMode === 'local') {
       console.log('⚠️ Mode local activé - pas de synchronisation');
     }
   });
   ```

3. **Vérifier les logs** :
   - Ouvrir la console (F12)
   - Regarder les messages `[LeadTracker]`
   - Chercher les erreurs éventuelles

4. **Reconnecter à Supabase** :
   - Dashboard → Section Supabase → Se déconnecter puis se reconnecter

### Les logs montrent des erreurs

Si vous voyez des erreurs dans la console :

- `Supabase error 401` → Token expiré, reconnectez-vous
- `Supabase error 400` → Problème de format de données
- `Supabase sync non disponible` → Extension pas complètement chargée

---

## 🚀 Avantages de cette Solution

### ✅ Automatique
- Aucune action manuelle nécessaire
- Synchronisation en temps réel

### ✅ Intelligente
- Détecte automatiquement le mode (local/cloud)
- Pas de requêtes inutiles en mode local

### ✅ Robuste
- Gestion d'erreurs silencieuse
- Ne perturbe pas l'expérience utilisateur

### ✅ Flexible
- Mode local pour une utilisation sans compte
- Mode cloud pour la synchronisation multi-appareils

---

## 📝 Notes Importantes

1. **Mode Local** : Les données restent uniquement sur votre navigateur
2. **Mode Cloud** : Les données sont synchronisées à chaque modification
3. **Basculement** : Vous pouvez passer du mode local au mode cloud à tout moment
4. **Double sauvegarde** : Les données sont toujours sauvegardées localement, même en mode cloud

---

## 🔐 Sécurité

- Le token Supabase est stocké de manière sécurisée dans `chrome.storage.local`
- Les données sont protégées par Row Level Security (RLS) dans Supabase
- Seul votre compte peut accéder à vos données
