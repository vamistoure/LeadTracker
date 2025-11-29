# Guide : Obtenir un token Supabase pour l'import

## Problème
Si `chrome.storage.local.get(['supabaseAccessToken'])` retourne `undefined`, cela signifie que vous n'êtes pas connecté à Supabase dans l'extension.

## Solutions

### Option 1 : Créer un compte email/password dans Supabase (Recommandé)

1. Allez sur https://supabase.com/dashboard
2. Sélectionnez votre projet (ou créez-en un)
3. Allez dans **Authentication** > **Users**
4. Cliquez sur **Add user** > **Create new user**
5. Créez un utilisateur avec email/password pour ce projet
6. Utilisez ces identifiants avec le script d'import :
   ```bash
   node importBackup.js "linkedin-leads-backup-2025-11-28 (2).json" votre-email@example.com votre-password
   ```

### Option 2 : Obtenir un token depuis Supabase Dashboard

1. Allez sur https://supabase.com/dashboard
2. Sélectionnez votre projet
3. Allez dans **Settings** > **API**
4. Dans la section **Project API keys**, vous trouverez :
   - `anon` key (publique, pour l'extension)
   - `service_role` key (privée, ⚠️ ne pas partager)

⚠️ **Important** : Les clés API ne sont pas des tokens d'authentification. Elles permettent d'accéder à l'API mais avec les permissions RLS (Row Level Security).

### Option 3 : Se connecter via l'extension (si interface existe)

1. Ouvrez l'extension LeadTracker
2. Cherchez une section "Synchronisation Supabase" ou "Connexion Supabase"
3. Connectez-vous avec vos identifiants
4. Une fois connecté, le token sera stocké dans `chrome.storage.local`

### Option 4 : Obtenir un token via l'API Supabase directement

Pour un compte GitHub OAuth, vous pouvez obtenir un token via l'API :

```bash
# D'abord, vous devez obtenir un code d'autorisation GitHub
# Puis l'échanger contre un token Supabase

curl -X POST 'https://hcahvwbzgyeqkamephzn.supabase.co/auth/v1/token?grant_type=github' \
  -H "apikey: VOTRE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "github",
    "code": "CODE_FROM_GITHUB"
  }'
```

## Solution rapide : Créer un utilisateur avec mot de passe

La solution la plus simple est de créer un utilisateur avec email/password dans Supabase :

1. **Via l'API Supabase** (recommandé) :
   ```bash
   # Utiliser le script d'import avec l'option de création automatique
   # Le script tentera de créer le compte si la connexion échoue
   node importBackup.js "linkedin-leads-backup-2025-11-28 (2).json" votre-email@example.com votre-password
   ```

2. **Via Supabase Dashboard** :
   - Authentication > Users > Add user > Create new user
   - Entrez un email et un mot de passe
   - Utilisez ces identifiants avec le script

## Vérifier si vous êtes connecté

Dans la console du navigateur (sur la page de l'extension) :

```javascript
// Vérifier le token
chrome.storage.local.get(['supabaseAccessToken', 'supabaseUser'], result => {
  console.log('Token:', result.supabaseAccessToken ? '✅ Présent' : '❌ Absent');
  console.log('User:', result.supabaseUser);
});
```

## Notes importantes

- ⚠️ Les tokens d'accès expirent (généralement après 1 heure)
- 🔄 Si votre token expire, reconnectez-vous
- 🔐 Pour un usage en production, utilisez un compte dédié avec email/password
