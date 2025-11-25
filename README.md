# LinkedIn Lead Follow-Up - Extension Chrome

Extension Chrome Manifest V3 pour suivre les leads LinkedIn avec rappels J+5 à J+7.

## Installation

1. Ouvrir Chrome et aller sur `chrome://extensions/`
2. Activer le "Mode développeur" (en haut à droite)
3. Cliquer sur "Charger l'extension non empaquetée"
4. Sélectionner le dossier `LeadTracker`

## ⚠️ Important : Ajouter les icônes

Avant de charger l'extension, vous devez ajouter 3 fichiers PNG dans le dossier `icons/` :

- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

Vous pouvez utiliser n'importe quelle image PNG aux bonnes dimensions, ou créer des placeholders simples.

## Utilisation

1. **Sur une page de recherche LinkedIn** : Cliquer sur l'icône de l'extension pour enregistrer un titre de recherche
2. **Sur un profil LinkedIn** : Cliquer sur l'icône pour ajouter un lead avec ses informations
3. **Dashboard** : Cliquer sur l'icône puis "Ouvrir le dashboard" pour voir tous les leads, filtrer, exporter en CSV

## Fonctionnalités

- ✅ Enregistrement de titres de recherche
- ✅ Création manuelle de leads depuis un profil
- ✅ Filtrage par titre, dates, leads à contacter
- ✅ Notifications automatiques J+5 à J+7
- ✅ Export CSV
- ✅ Toutes les données stockées localement (chrome.storage.local)

## 🔒 Sécurité et Conformité LinkedIn

**IMPORTANT - Protection anti-bannissement :**

- ✅ **Aucun scraping automatique** : L'extension ne fait JAMAIS de requêtes automatiques
- ✅ **Action 100% manuelle** : Toute lecture du DOM est déclenchée uniquement par votre clic sur l'icône
- ✅ **Pas de navigation automatique** : L'extension ne navigue jamais vers d'autres pages
- ✅ **Pas de boucles** : Aucune requête répétée ou polling
- ✅ **Rate limiting** : Protection intégrée contre les appels trop rapides (minimum 500ms entre appels)
- ✅ **Lecture unique** : Chaque ouverture du popup = 1 seule lecture du DOM de la page actuelle
- ✅ **Pas de requêtes réseau** : Aucune communication avec des serveurs externes
- ✅ **Respect des ToS LinkedIn** : L'extension aide uniquement à organiser vos leads manuels, elle n'automatise pas l'envoi d'invitations

**L'extension est conçue pour être sûre et respecter les conditions d'utilisation de LinkedIn.**

# LeadTracker
