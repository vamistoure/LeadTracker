# Import de backup JSON dans Supabase

## Méthode 1 : Script Node.js (Recommandé)

Utilisez le script `importBackup.js` pour importer directement le fichier JSON dans Supabase.

### Prérequis
- Node.js 18+ (fetch natif)
- Credentials Supabase :
  - **Option A** : Email + password (pour comptes créés avec email)
  - **Option B** : Access token (pour comptes GitHub OAuth) - **recommandé**

### Usage

#### Option A : Avec email/password

```bash
# Méthode 1 : Arguments en ligne de commande
node importBackup.js "linkedin-leads-backup-2025-11-28 (2).json" votre-email@example.com votre-password

# Méthode 2 : Variables d'environnement
SUPABASE_EMAIL=votre-email@example.com SUPABASE_PASSWORD=votre-password node importBackup.js "linkedin-leads-backup-2025-11-28 (2).json"
```

#### Option B : Avec access token (pour comptes GitHub OAuth) ⭐

1. **Obtenir le token :**
   - Ouvrez l'extension LeadTracker
   - Connectez-vous à Supabase (via GitHub si nécessaire)
   - Ouvrez la console du navigateur (F12)
   - Exécutez : `chrome.storage.local.get(['supabaseAccessToken'], r => console.log(r.supabaseAccessToken))`
   - Ou utilisez la page `getToken.html` pour une interface graphique

2. **Utiliser le token :**
```bash
node importBackup.js "linkedin-leads-backup-2025-11-28 (2).json" --token VOTRE_ACCESS_TOKEN
```

### Exemples

```bash
# Avec email/password
node importBackup.js "linkedin-leads-backup-2025-11-28 (2).json" user@example.com mypassword

# Avec access token (pour comptes GitHub)
node importBackup.js "linkedin-leads-backup-2025-11-28 (2).json" --token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Le script va :
1. Lire le fichier JSON
2. Se connecter à Supabase
3. Importer tous les leads et searchTitles
4. Afficher un résumé de l'import

## Méthode 2 : Obtenir le token facilement

Ouvrez la page `getToken.html` dans l'extension pour obtenir votre access token avec une interface graphique.

1. Chargez `getToken.html` dans Chrome (via `chrome://extensions` > Détails > Page d'options ou directement)
2. Cliquez sur "Récupérer le token"
3. Copiez le token affiché
4. Utilisez-le avec `--token` dans le script d'import

## Méthode 3 : Depuis la console du navigateur

1. Ouvrez la page `options.html` de l'extension
2. Connectez-vous à Supabase (section Synchronisation)
3. Ouvrez la console du navigateur (F12)
4. Chargez le fichier JSON et importez-le :

```javascript
// Lire le fichier (via input file ou fetch)
fetch('/path/to/linkedin-leads-backup-2025-11-28 (2).json')
  .then(r => r.json())
  .then(backup => {
    importBackupToSupabase(backup);
  });
```

Ou si vous avez déjà le contenu JSON :

```javascript
const backupData = { /* votre objet JSON */ };
importBackupToSupabase(backupData);
```

## Format du backup attendu

Le fichier JSON doit avoir cette structure :

```json
{
  "exportedAt": "2025-11-28T23:05:02.261Z",
  "leads": [
    {
      "id": "...",
      "name": "...",
      "headline": "...",
      // ... autres propriétés
    }
  ],
  "searchTitles": [
    {
      "id": "...",
      "label": "..."
    }
  ]
}
```

## Notes

- Les leads existants seront mis à jour (merge par ID)
- Les nouveaux leads seront créés
- La fonction utilise `pushChanges` de `supabaseSync.js` qui gère automatiquement la conversion camelCase ↔ snake_case
- La dernière synchronisation est mise à jour après l'import
