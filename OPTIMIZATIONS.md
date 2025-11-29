# Optimisations Supabase pour LeadTracker

## 📊 Résumé des problèmes identifiés

### Performance
1. **RLS Policies inefficaces** : Toutes les policies réévaluent `auth.uid()` pour chaque ligne
2. **Index manquant** : Pas d'index sur `lead_events.user_id` (clé étrangère)
3. **Index manquants pour requêtes fréquentes** : 
   - Recherche par `profile_url` (déduplication)
   - Filtres par `search_title`, `acceptance_date`, `direction`
   - Requêtes "à contacter" (J+5)

### Sécurité
1. **Fonction `set_updated_at`** : `search_path` mutable (risque d'injection SQL)

## ✅ Optimisations appliquées

### 1. Correction des RLS Policies
**Avant** : `auth.uid() = user_id` (réévalué pour chaque ligne)  
**Après** : `(select auth.uid()) = user_id` (évalué une seule fois)

**Impact** : Amélioration significative des performances sur les requêtes avec beaucoup de lignes.

### 2. Index ajoutés

| Index | Table | Colonnes | Usage |
|-------|-------|----------|-------|
| `idx_events_user_id` | `lead_events` | `user_id` | Jointures et filtres RLS |
| `idx_leads_profile_url` | `leads` | `profile_url` | Déduplication lors de l'ajout |
| `idx_leads_user_search_title` | `leads` | `user_id, search_title` | Filtrage par titre dans dashboard |
| `idx_leads_acceptance_date` | `leads` | `user_id, acceptance_date` | Filtres sur dates et calcul J+5 |
| `idx_leads_to_contact` | `leads` | `user_id, acceptance_date` | Requête "à contacter" (J+5, non contactés) |
| `idx_leads_direction` | `leads` | `user_id, direction` | Filtrage par type de connexion |
| `idx_leads_company` | `leads` | `user_id, company` | Recherche par entreprise |
| `idx_leads_tags_gin` | `leads` | `tags` (GIN) | Recherche dans les tags |

### 3. Sécurité de la fonction `set_updated_at`
- Ajout de `security definer`
- `search_path` fixé explicitement à `public`
- Protection contre l'injection SQL

## 🚀 Comment appliquer les optimisations

### Option 1 : Via Supabase Dashboard
1. Ouvrir le SQL Editor dans Supabase
2. Copier le contenu de `schema_optimizations.sql`
3. Exécuter le script

### Option 2 : Via MCP Supabase
```bash
# Appliquer la migration
mcp_user-supabase_apply_migration
```

### Option 3 : Via CLI Supabase
```bash
supabase db push schema_optimizations.sql
```

## 📈 Impact attendu

### Requêtes fréquentes optimisées

1. **Déduplication de leads** (`profile_url`)
   - Avant : Scan séquentiel
   - Après : Recherche indexée O(log n)

2. **Filtrage par titre** (`search_title`)
   - Avant : Scan avec filtre
   - Après : Index composite utilisable

3. **Requête "à contacter"** (J+5, non contactés)
   - Avant : Scan complet avec filtres
   - Après : Index partiel optimisé

4. **Synchronisation** (`updated_at`)
   - Avant : RLS réévalué pour chaque ligne
   - Après : RLS optimisé + index existant

## 🔍 Vérification post-optimisation

### Vérifier les advisors Supabase
```sql
-- Vérifier qu'il n'y a plus d'avertissements RLS
SELECT * FROM supabase.get_advisors('performance');
SELECT * FROM supabase.get_advisors('security');
```

### Tester les performances
```sql
-- Test de déduplication (requête fréquente)
EXPLAIN ANALYZE
SELECT * FROM leads 
WHERE user_id = auth.uid() 
  AND profile_url = 'https://linkedin.com/in/test';

-- Test de filtrage par titre
EXPLAIN ANALYZE
SELECT * FROM leads 
WHERE user_id = auth.uid() 
  AND search_title = 'DATA ENGINEER'
ORDER BY updated_at DESC;

-- Test "à contacter" (J+5)
EXPLAIN ANALYZE
SELECT * FROM leads 
WHERE user_id = auth.uid()
  AND contacted = false
  AND acceptance_date = CURRENT_DATE - INTERVAL '5 days';
```

## 📝 Notes importantes

1. **Index non utilisés** : Les index existants (`idx_leads_user_updated`, etc.) peuvent apparaître comme "non utilisés" si la base est vide. Ils seront utilisés automatiquement quand des données seront ajoutées.

2. **Index partiels** : Les index avec `WHERE` clause (`idx_leads_to_contact`, `idx_leads_company`) sont plus petits et plus rapides car ils ne couvrent que les lignes pertinentes.

3. **Index GIN pour tags** : L'index GIN sur `tags` est utile si vous faites des recherches dans les tableaux de tags. Si ce n'est pas utilisé, il peut être supprimé plus tard.

4. **Maintenance** : PostgreSQL maintient automatiquement les index. Aucune action manuelle requise.

## 🔄 Prochaines optimisations possibles

1. **Partitionnement** : Si la table `leads` devient très grande (>1M lignes), considérer le partitionnement par `user_id` ou par date.

2. **Archivage** : Créer une table `leads_archive` pour les leads anciens (>1 an) et les déplacer périodiquement.

3. **Matérialisation** : Si les requêtes de statistiques sont lentes, créer des vues matérialisées pour les métriques fréquentes.

4. **Connection pooling** : Utiliser Supabase Connection Pooler pour les requêtes fréquentes depuis l'extension.
