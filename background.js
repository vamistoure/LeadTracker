/**
 * Utilitaire : Calculer la différence en jours entre deux dates YYYY-MM-DD
 */
function getDaysDifference(dateString) {
  if (!dateString) return -1;
  const oneDay = 24 * 60 * 60 * 1000;
  const acceptanceDate = new Date(dateString);
  const today = new Date();
  
  // Reset des heures pour comparer uniquement les jours
  acceptanceDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((today - acceptanceDate) / oneDay);
  return diffDays;
}

/**
 * Initialisation de l'alarme quotidienne
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installée. Création de l'alarme quotidienne.");
  // Vérification quotidienne (toutes les 1440 minutes = 24h)
  chrome.alarms.create('daily-check', { periodInMinutes: 1440 });
});

/**
 * Gestion de l'alarme
 */
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'daily-check') {
    checkLeadsForNotification();
  }
});

/**
 * Vérifie les leads et notifie si nécessaire (J+5 à J+7)
 */
function checkLeadsForNotification() {
  chrome.storage.local.get(['leads'], (result) => {
    const leads = result.leads || [];
    let leadsToContactCount = 0;
    let detailsByTitle = {};

    leads.forEach(lead => {
      // Ignorer les leads en attente (pas de date d'acceptation)
      if (!lead.acceptanceDate) return;
      
      const days = getDaysDifference(lead.acceptanceDate);
      // Critères : Pas encore contacté ET entre 5 et 7 jours après acceptation
      if (!lead.contacted && days >= 5 && days <= 7) {
        leadsToContactCount++;
        
        // Agrégation par titre pour le message
        if (!detailsByTitle[lead.searchTitle]) {
          detailsByTitle[lead.searchTitle] = 0;
        }
        detailsByTitle[lead.searchTitle]++;
      }
    });

    if (leadsToContactCount > 0) {
      let message = "";
      const titles = Object.keys(detailsByTitle);
      
      // Construction d'un message résumé court
      if (titles.length === 1) {
        message = `${leadsToContactCount} leads pour "${titles[0]}"`;
      } else {
        message = titles.map(t => `${t}: ${detailsByTitle[t]}`).join(', ');
      }

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: `Rappel : ${leadsToContactCount} leads à relancer`,
        message: message,
        priority: 2
      });
    }
  });
}

/**
 * Clic sur la notification : ouvrir le dashboard avec filtre
 */
chrome.notifications.onClicked.addListener(() => {
  const optionsUrl = chrome.runtime.getURL('options.html') + '?filter=to_contact';
  chrome.tabs.create({ url: optionsUrl });
});

/**
 * Gestion des messages pour afficher le badge
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "SHOW_BADGE") {
    chrome.action.setBadgeText({ text: request.text || "1" });
    chrome.action.setBadgeBackgroundColor({ color: "#0a66c2" });
  }
  return false;
});
