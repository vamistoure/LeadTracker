# Debug Synchronisation Supabase

## Problème
Les leads scannés ne sont pas visibles dans Supabase.

## Corrections appliquées

### 1. Conversion camelCase ↔ snake_case
- ✅ Ajout de `convertLeadToSupabase()` dans `background.js`
- ✅ Conversion automatique avant l'envoi à Supabase

### 2. Ajout du user_id
- ✅ Extraction du `user_id` depuis le token JWT
- ✅ Ajout automatique à chaque lead avant l'envoi

### 3. Fonction d'upsert
- ✅ Création de `upsert_lead()` dans Supabase
- ✅ Upsert basé sur `(user_id, profile_url)`
- ✅ Gestion des IDs locaux (timestamp_random) → UUID Supabase

## Vérifications à faire

### 1. Vérifier la connexion Supabase
Ouvrez la console du navigateur (F12) et vérifiez :
```javascript
chrome.storage.local.get(['supabaseAccessToken', 'supabaseUser'], (result) => {
  console.log('Token:', result.supabaseAccessToken ? 'Présent' : 'Absent');
  console.log('User:', result.supabaseUser);
});
```

### 2. Vérifier les logs de synchronisation
Dans la console du navigateur, cherchez :
- `[LeadTracker] Push Supabase réussi` → Synchronisation OK
- `[LeadTracker] Erreur push leads` → Erreur à corriger
- `[LeadTracker] Pas de token Supabase` → Connexion requise

### 3. Tester manuellement la synchronisation
Dans la console du navigateur :
```javascript
// Récupérer les leads locaux
chrome.storage.local.get(['leads'], (result) => {
  console.log('Leads locaux:', result.leads?.length || 0);
  
  // Forcer la synchronisation
  chrome.runtime.sendMessage({
    type: 'PUSH_SUPABASE',
    leads: result.leads?.slice(0, 1) || [] // Tester avec 1 lead
  });
});
```

### 4. Vérifier dans Supabase
```sql
-- Vérifier les leads
SELECT COUNT(*) as total, 
       COUNT(DISTINCT user_id) as users,
       COUNT(DISTINCT profile_url) as unique_profiles
FROM public.leads;

-- Voir les derniers leads ajoutés
SELECT id, user_id, name, profile_url, created_at, updated_at
FROM public.leads
ORDER BY created_at DESC
LIMIT 10;
```

## Problèmes possibles

### Problème 1 : Pas de token Supabase
**Symptôme** : `[LeadTracker] Pas de token Supabase, push annulé`

**Solution** :
1. Ouvrir `options.html` dans l'extension
2. Se connecter à Supabase (section "Synchronisation Supabase")
3. Entrer email/mot de passe
4. Vérifier que le statut affiche "Connecté"

### Problème 2 : Erreur d'authentification
**Symptôme** : `Supabase error 401` ou `User must be authenticated`

**Solution** :
1. Vérifier que le token n'est pas expiré
2. Se reconnecter à Supabase
3. Vérifier les logs Supabase pour les erreurs d'auth

### Problème 3 : Erreur de format
**Symptôme** : `Supabase error 400` avec message de validation

**Solution** :
- Les logs affichent les données envoyées
- Vérifier que toutes les colonnes sont au format snake_case
- Vérifier que `user_id` est un UUID valide

### Problème 4 : RLS bloque l'insertion
**Symptôme** : `Supabase error 403` ou leads non visibles

**Solution** :
- Vérifier que les policies RLS sont correctes
- Vérifier que `user_id` correspond bien à l'utilisateur authentifié

## Test de la fonction upsert_lead

Pour tester directement la fonction PostgreSQL :

```sql
-- Tester avec un lead exemple
SELECT public.upsert_lead('{
  "user_id": "VOTRE_USER_ID_ICI",
  "name": "Test Lead",
  "profile_url": "https://linkedin.com/in/test",
  "headline": "Test Headline",
  "company": "Test Company",
  "search_title": "TEST TITLE",
  "direction": "outbound_pending"
}'::jsonb);
```

## Prochaines étapes

1. **Scanner de nouveaux leads** et vérifier les logs console
2. **Vérifier dans Supabase** avec les requêtes SQL ci-dessus
3. **Si toujours 0 leads** : Vérifier les logs d'erreur dans la console
4. **Si erreurs** : Partager les messages d'erreur pour diagnostic

## Notes techniques

- Les IDs locaux (format `timestamp_random`) sont ignorés
- Supabase génère automatiquement des UUIDs
- L'upsert utilise `(user_id, profile_url)` comme clé unique
- La fonction `upsert_lead()` respecte RLS et vérifie l'authentification
