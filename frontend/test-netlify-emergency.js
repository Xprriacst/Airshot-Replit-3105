// Ce script teste la fonction analyze-emergency localement avec Netlify CLI
// Pour l'exécuter : 
// 1. Démarrer netlify dev dans un terminal
// 2. Dans un autre terminal : node test-netlify-emergency.js

import fetch from 'node-fetch';

// URL locale de la fonction Netlify (ajustez le port si nécessaire)
const NETLIFY_LOCAL_URL = 'http://localhost:8888/.netlify/functions/analyze-emergency';

// Vérifier si la fonction est disponible
const checkFunctionAvailability = async () => {
  try {
    const response = await fetch('http://localhost:8888/.netlify/functions', {
      method: 'GET',
    });
    if (response.ok) {
      const functions = await response.json();
      console.log('Fonctions disponibles:', functions);
    } else {
      console.log('Impossible de récupérer la liste des fonctions, statut:', response.status);
    }
  } catch (error) {
    console.log('Erreur lors de la vérification des fonctions disponibles:', error.message);
  }
};

// Scénarios de test
const testScenarios = [
  {
    name: "TEST 1: RESTAURANT RECOMMANDÉ",
    message: "Bonjour, pouvez-vous me recommander un bon restaurant à proximité de l'appartement ?"
  },
  {
    name: "TEST 2: PLACES DE STATIONNEMENT",
    message: "Où puis-je garer ma voiture ? Y a-t-il un parking à proximité ?"
  },
  {
    name: "TEST 3: CLIENT MÉCONTENT",
    message: "Je suis très déçu par la propreté de l'appartement, la salle de bain est sale et le salon n'a pas été nettoyé !"
  },
  {
    name: "TEST 4: PROBLÈME CRITIQUE",
    message: "Il y a une fuite d'eau importante dans la salle de bain, l'eau coule du plafond !"
  }
];

// Instructions AI personnalisées pour les tests
const testInstructions = `Bienvenue à l'appartement Soleil Levant!

Code WiFi: ResidenceSoleil2024
Mot de passe: 87A9b2cD

CHAUFFAGE:
Le thermostat se trouve dans l'entrée. Régler entre 20-22°C.

CUISINE:
- Machine à café: capsules compatibles Nespresso (tiroir du haut)
- Lave-vaisselle: pastilles sous l'évier

ÉQUIPEMENTS DISPONIBLES:
- Sèche-cheveux dans la salle de bain
- Fer à repasser dans le placard de l'entrée
- Télévision avec Netflix (identifiants sur la table basse)

RESTAURANTS RECOMMANDÉS:
- Restaurant Azur: Excellente cuisine locale avec vue sur la mer
- Bistrot du Marché: Idéal pour un déjeuner rapide

CHECK-OUT:
- Départ avant 11h
- Laisser les clés sur la table
- Mettre les serviettes utilisées dans la baignoire

NUMEROS UTILES:
- Urgence propriétaire: 06 78 90 12 34
- Pompiers: 18
- Police: 17`;

// Fonction pour tester un scénario
async function testScenario(scenario) {
  try {
    console.log(`\n${scenario.name}`);
    console.log('-'.repeat(scenario.name.length));
    
    // Préparer les données de la requête
    const requestData = {
      conversationId: `test-${Date.now()}`,
      hostId: 'host-123',
      apartmentId: 'sandbox-test-123',
      customInstructions: testInstructions, // Utiliser nos instructions personnalisées
      messages: [
        {
          content: scenario.message,
          direction: 'inbound',
          created_at: new Date().toISOString()
        }
      ]
    };
    
    console.log(`Message testé: "${scenario.message}"`);
    console.log("Envoi de la requête à la fonction Netlify...");
    
    // Appeler la fonction Netlify
    const response = await fetch(NETLIFY_LOCAL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });
    
    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Afficher les résultats
    console.log(`\nRÉSULTAT:`);
    console.log(`Urgence: ${result.isEmergency ? 'OUI' : 'NON'}`);
    console.log(`Type: ${result.emergencyType || 'Aucun'}`);
    if (result.unknownResponse !== undefined) {
      console.log(`Information manquante: ${result.unknownResponse ? 'OUI' : 'NON'}`);
    }
    if (result.hasIncoherence) {
      console.log(`Incohérence détectée: OUI`);
      console.log(`Raison: ${result.incoherenceReason}`);
    }
    console.log(`Explication: ${result.explanation}`);
    
    return result;
  } catch (error) {
    console.error(`Erreur lors du test "${scenario.name}":`, error.message);
    return null;
  }
}

// Fonction principale
async function runTests() {
  console.log('===== TESTS DE DÉTECTION D\'URGENCE AVEC NETLIFY CLI =====');
  console.log('Assurez-vous que netlify dev est en cours d\'exécution\n');
  
  // Vérifier si la fonction est disponible
  await checkFunctionAvailability();
  
  for (const scenario of testScenarios) {
    await testScenario(scenario);
    console.log('-------------------------------------');
    
    // Pause entre les requêtes pour éviter le rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n===== FIN DES TESTS =====');
}

// Exécuter les tests
runTests().catch(console.error);
