#!/usr/bin/env node
/**
 * Script pour importer un backup JSON dans Supabase
 * 
 * Usage avec email/password:
 *   node importBackup.js <fichier-backup.json> <email> <password>
 * 
 * Usage avec access token (recommandé pour comptes GitHub OAuth):
 *   node importBackup.js <fichier-backup.json> --token <access_token>
 * 
 * Ou avec variables d'environnement:
 *   SUPABASE_EMAIL=... SUPABASE_PASSWORD=... node importBackup.js <fichier-backup.json>
 *   SUPABASE_ACCESS_TOKEN=... node importBackup.js <fichier-backup.json> --token
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Charger supabaseSync.js (adapté pour Node.js)
const supabaseSyncPath = path.join(__dirname, 'supabaseSync.js');
let supabaseSync;

// Vérifier la version de Node.js (fetch natif depuis Node 18+)
const nodeVersion = process.version.match(/^v(\d+)/)?.[1];
if (!nodeVersion || parseInt(nodeVersion) < 18) {
  console.error('❌ Node.js 18+ requis pour fetch natif');
  console.log('   Installez node-fetch: npm install node-fetch@2');
  console.log('   Ou mettez à jour Node.js vers la version 18+');
  process.exit(1);
}

try {
  // Créer un contexte isolé pour évaluer supabaseSync.js
  const supabaseSyncCode = fs.readFileSync(supabaseSyncPath, 'utf8');
  
  // Helper pour atob dans Node.js (décodage base64)
  // Note: supabaseSync.js fait déjà la conversion base64url -> base64 avant d'appeler atob
  const atobPolyfill = (str) => {
    // Ajouter le padding si nécessaire
    const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
    // Décoder en binaire (comme atob dans le navigateur)
    return Buffer.from(padded, 'base64').toString('binary');
  };
  
  // Créer un contexte avec les objets nécessaires
  const context = {
    module: { exports: {} },
    exports: {},
    require: require,
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    Buffer: Buffer,
    process: process,
    global: global,
    fetch: global.fetch, // Node.js 18+ a fetch natif
    URL: URL,
    URLSearchParams: URLSearchParams,
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder,
    atob: global.atob || atobPolyfill, // Polyfill pour Node.js
    window: {} // Pour compatibilité avec le code qui vérifie window
  };
  
  // Créer le contexte VM
  const vmContext = vm.createContext(context);
  
  // Évaluer le code dans le contexte isolé
  vm.runInContext(supabaseSyncCode, vmContext);
  
  // Récupérer le module exporté
  supabaseSync = vmContext.module.exports || vmContext.exports;
  
  if (!supabaseSync || !supabaseSync.pushChanges) {
    throw new Error('supabaseSync non chargé correctement');
  }
} catch (e) {
  console.error('❌ Erreur lors du chargement de supabaseSync.js:', e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
}

async function importBackup(backupFilePath, options = {}) {
  try {
    // Lire le fichier backup
    console.log(`📖 Lecture du fichier: ${backupFilePath}`);
    const backupContent = fs.readFileSync(backupFilePath, 'utf8');
    const backupData = JSON.parse(backupContent);

    if (!backupData.leads || !Array.isArray(backupData.leads)) {
      console.error('❌ Format de backup invalide: propriété "leads" manquante ou invalide');
      process.exit(1);
    }

    const leads = backupData.leads || [];
    const searchTitles = backupData.searchTitles || [];

    console.log(`📊 Backup contient: ${leads.length} leads, ${searchTitles.length} titres de recherche`);

    // Obtenir le token d'accès
    let accessToken;
    
    if (options.accessToken) {
      // Utiliser le token fourni directement
      accessToken = options.accessToken;
      console.log('🔑 Utilisation du token d\'accès fourni');
    } else {
      // Se connecter avec email/password
      const { email, password } = options;
      console.log('🔐 Connexion à Supabase...');
      if (!email || !password) {
        console.error('❌ Email et mot de passe requis (ou utilisez --token avec un access token)');
        console.log('');
        console.log('Usage:');
        console.log('  node importBackup.js <fichier.json> <email> <password>');
        console.log('  node importBackup.js <fichier.json> --token <access_token>');
        console.log('');
        console.log('Pour obtenir un access token:');
        console.log('  1. Ouvrez l\'extension LeadTracker');
        console.log('  2. Connectez-vous à Supabase');
        console.log('  3. Ouvrez la console du navigateur (F12)');
        console.log('  4. Exécutez: chrome.storage.local.get([\'supabaseAccessToken\'], r => console.log(r.supabaseAccessToken))');
        process.exit(1);
      }

      let authResult;
      try {
        authResult = await supabaseSync.signInWithPassword(email, password);
      } catch (authError) {
        // Si erreur 400, peut-être que le compte n'existe pas - essayer de le créer
        if (authError.status === 400) {
          console.log('⚠️  Connexion échouée. Tentative de création du compte...');
          try {
            const signUpResult = await supabaseSync.signUpWithPassword(email, password);
            if (signUpResult.access_token) {
              authResult = signUpResult;
              console.log('✅ Compte créé et connecté automatiquement');
            } else if (signUpResult.user) {
              console.log('✅ Compte créé, mais confirmation email requise.');
              console.log('   Vérifiez votre email et cliquez sur le lien de confirmation.');
              console.log('   Puis relancez ce script.');
              process.exit(1);
            }
          } catch (signUpError) {
            console.error('❌ Erreur lors de la création du compte:', signUpError.message);
            if (signUpError.response) {
              console.error('\n📋 Détails:', JSON.stringify(signUpError.response, null, 2));
            }
            console.error('\n❌ Erreur de connexion Supabase:', authError.message);
          }
        }
        
        // Si toujours pas de résultat, afficher l'erreur
        if (!authResult || !authResult.access_token) {
          console.error('❌ Erreur de connexion Supabase:', authError.message);
          // Afficher plus de détails si disponibles
          if (authError.response) {
            console.error('\n📋 Détails de la réponse:');
            console.error(JSON.stringify(authError.response, null, 2));
          }
          if (authError.responseText) {
            console.error('\n📄 Réponse brute:', authError.responseText);
          }
          console.log('\n💡 Pour un compte GitHub OAuth, utilisez plutôt:');
          console.log('   node importBackup.js <fichier.json> --token <access_token>');
          console.log('\n   Pour obtenir le token:');
          console.log('   1. Ouvrez l\'extension et connectez-vous');
          console.log('   2. Console navigateur: chrome.storage.local.get([\'supabaseAccessToken\'], r => console.log(r.supabaseAccessToken))');
          process.exit(1);
        }
      }
      
      if (!authResult || !authResult.access_token) {
        console.error('❌ Échec de la connexion Supabase: aucun token reçu');
        console.log('Réponse reçue:', JSON.stringify(authResult, null, 2));
        console.log('\n💡 Essayez de vous connecter via l\'interface de l\'extension d\'abord');
        process.exit(1);
      }

      accessToken = authResult.access_token;
      console.log('✅ Connecté à Supabase');
    }

    // Pousser les données
    console.log('📤 Envoi des données vers Supabase...');
    const result = await supabaseSync.pushChanges(accessToken, {
      leads,
      searchTitles
    });

    console.log('✅ Import terminé avec succès!');
    console.log(`   - ${result.leads?.length || 0} leads synchronisés`);
    console.log(`   - ${result.searchTitles?.length || 0} titres synchronisés`);

  } catch (e) {
    console.error('❌ Erreur lors de l\'import:', e.message);
    if (e.stack) console.error(e.stack);
    process.exit(1);
  }
}

// Point d'entrée
const args = process.argv.slice(2);
const backupFile = args[0];

if (!backupFile) {
  console.error('❌ Fichier backup requis');
  console.log('');
  console.log('Usage:');
  console.log('  node importBackup.js <fichier-backup.json> <email> <password>');
  console.log('  node importBackup.js <fichier-backup.json> --token <access_token>');
  console.log('');
  console.log('Exemples:');
  console.log('  # Avec email/password:');
  console.log('  node importBackup.js "linkedin-leads-backup-2025-11-28 (2).json" user@example.com password');
  console.log('');
  console.log('  # Avec access token (pour comptes GitHub OAuth):');
  console.log('  node importBackup.js "linkedin-leads-backup-2025-11-28 (2).json" --token eyJhbGc...');
  console.log('');
  console.log('  # Variables d\'environnement:');
  console.log('  SUPABASE_EMAIL=... SUPABASE_PASSWORD=... node importBackup.js <fichier.json>');
  console.log('  SUPABASE_ACCESS_TOKEN=... node importBackup.js <fichier.json> --token');
  process.exit(1);
}

if (!fs.existsSync(backupFile)) {
  console.error(`❌ Fichier non trouvé: ${backupFile}`);
  process.exit(1);
}

// Analyser les arguments
const options = {};
const tokenIndex = args.indexOf('--token');
if (tokenIndex !== -1) {
  // Mode token
  options.accessToken = args[tokenIndex + 1] || process.env.SUPABASE_ACCESS_TOKEN;
  if (!options.accessToken) {
    console.error('❌ Access token requis avec --token');
    console.log('Usage: node importBackup.js <fichier.json> --token <access_token>');
    process.exit(1);
  }
} else {
  // Mode email/password
  options.email = args[1] || process.env.SUPABASE_EMAIL;
  options.password = args[2] || process.env.SUPABASE_PASSWORD;
}

importBackup(backupFile, options);
