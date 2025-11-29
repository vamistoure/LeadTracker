# 🚀 Solution rapide : Créer un compte pour l'import

## Étape 1 : Créer un utilisateur dans Supabase

### Méthode A : Via le script (automatique)

Le script peut créer automatiquement un compte si vous lui donnez un email et un mot de passe :

```bash
node importBackup.js "linkedin-leads-backup-2025-11-28 (2).json" votre-email@example.com un-mot-de-passe
```

Le script va :
1. Essayer de se connecter avec ces identifiants
2. Si ça échoue, créer automatiquement le compte
3. Se connecter avec le compte créé
4. Importer les données

### Méthode B : Via Supabase Dashboard (manuel)

1. Allez sur https://supabase.com/dashboard
2. Sélectionnez votre projet (`hcahvwbzgyeqkamephzn`)
3. Allez dans **Authentication** > **Users**
4. Cliquez sur **Add user** > **Create new user**
5. Entrez :
   - **Email** : par exemple `import@example.com`
   - **Password** : un mot de passe fort
   - Cochez **Auto Confirm User** (sinon vous devrez confirmer l'email)
6. Cliquez sur **Create user**

## Étape 2 : Utiliser le compte pour l'import

Une fois le compte créé, utilisez-le avec le script :

```bash
node importBackup.js "linkedin-leads-backup-2025-11-28 (2).json" import@example.com votre-mot-de-passe
```

## Alternative : Utiliser un compte existant

Si vous avez déjà un compte avec email/password dans Supabase (même si vous vous connectez normalement via GitHub), vous pouvez l'utiliser directement.

## Vérification

Pour vérifier que tout fonctionne :

```bash
# Le script va afficher :
# ✅ Connecté à Supabase
# 📤 Envoi des données vers Supabase...
# ✅ Import terminé avec succès!
```
