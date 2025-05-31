import { handler } from './netlify/functions/analyze-emergency.js';

// Simuler les messages du supabase-js
const supabaseMock = {
  from: () => ({
    select: () => ({
      eq: () => ({
        single: async () => ({
          data: {
            id: 'mock-property-123',
            name: 'Appartement Test',
            ai_instructions: `Bienvenue à l'appartement Soleil Levant!

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
- Police: 17`
          },
          error: null
        })
      })
    }),
    insert: () => ({
      select: () => ({
        single: async () => ({
          data: { id: 'mock-analysis-123' },
          error: null
        })
      })
    })
  })
};

// Mock pour OpenAI
global.fetch = async (url, options) => {
  if (url.includes('openai')) {
    const requestBody = JSON.parse(options.body);
    const lastUserMessage = requestBody.messages.filter(m => m.role === 'user').pop().content;
    
    let response = { choices: [{ message: { content: '' } }] };
    
    // Réponses différentes selon le contenu du message
    if (lastUserMessage.includes('restaurant')) {
      response.choices[0].message.content = JSON.stringify({
        isEmergency: false,
        emergencyType: "Réponse connue",
        confidence: 0.95,
        unknownResponse: false,
        explanation: "L'information sur les restaurants recommandés est disponible dans les instructions de l'appartement."
      });
    } else if (lastUserMessage.includes('parking') || lastUserMessage.includes('garer') || lastUserMessage.includes('stationnement')) {
      response.choices[0].message.content = JSON.stringify({
        isEmergency: true,
        emergencyType: "IA incertaine",
        confidence: 0.9,
        unknownResponse: true,
        explanation: "Les informations concernant le stationnement ne sont pas disponibles dans les instructions."
      });
    } else if (lastUserMessage.includes('déçu') || lastUserMessage.includes('sale') || lastUserMessage.includes('mécontent')) {
      response.choices[0].message.content = JSON.stringify({
        isEmergency: true,
        emergencyType: "Client mécontent",
        confidence: 0.85,
        unknownResponse: false,
        explanation: "Le client exprime son mécontentement concernant la propreté de l'appartement."
      });
    } else if (lastUserMessage.includes('fuite') || lastUserMessage.includes('eau')) {
      response.choices[0].message.content = JSON.stringify({
        isEmergency: true,
        emergencyType: "Urgence critique",
        confidence: 0.95,
        unknownResponse: false,
        explanation: "Une fuite d'eau constitue une urgence critique qui nécessite une intervention immédiate."
      });
    } else {
      response.choices[0].message.content = JSON.stringify({
        isEmergency: false,
        emergencyType: null,
        confidence: 0.7,
        unknownResponse: false,
        explanation: "Aucune urgence ou information manquante détectée dans ce message."
      });
    }
    
    return {
      ok: true,
      json: async () => response
    };
  }

  // Pour les autres requêtes
  return {
    ok: true,
    json: async () => ({ data: {}, error: null })
  };
};

// Remplacer supabase par notre mock
global.createClient = () => supabaseMock;

// Fonction pour exécuter les tests
async function runTests() {
  console.log('===== TESTS DE DÉTECTION D\'URGENCE =====\n');

  // Test 1: Restaurant recommandé (Réponse connue)
  console.log('TEST 1: RESTAURANT RECOMMANDÉ');
  const test1Result = await testEmergencyDetection(
    'Bonjour, pouvez-vous me recommander un bon restaurant à proximité de l\'appartement ?'
  );
  console.log(`Résultat: ${test1Result.isEmergency ? 'URGENCE' : 'PAS D\'URGENCE'}`);
  console.log(`Type: ${test1Result.emergencyType || 'Aucun'}`);
  console.log(`Explication: ${test1Result.explanation}`);
  console.log('-------------------------------------\n');

  // Test 2: Places de stationnement (Manque information)
  console.log('TEST 2: PLACES DE STATIONNEMENT');
  const test2Result = await testEmergencyDetection(
    'Où puis-je garer ma voiture ? Y a-t-il un parking à proximité ?'
  );
  console.log(`Résultat: ${test2Result.isEmergency ? 'URGENCE' : 'PAS D\'URGENCE'}`);
  console.log(`Type: ${test2Result.emergencyType || 'Aucun'}`);
  console.log(`Manque d'information: ${test2Result.unknownResponse ? 'OUI' : 'NON'}`);
  console.log(`Explication: ${test2Result.explanation}`);
  console.log('-------------------------------------\n');

  // Test 3: Client mécontent
  console.log('TEST 3: CLIENT MÉCONTENT');
  const test3Result = await testEmergencyDetection(
    'Je suis très déçu par la propreté de l\'appartement, la salle de bain est sale et le salon n\'a pas été nettoyé !'
  );
  console.log(`Résultat: ${test3Result.isEmergency ? 'URGENCE' : 'PAS D\'URGENCE'}`);
  console.log(`Type: ${test3Result.emergencyType || 'Aucun'}`);
  console.log(`Explication: ${test3Result.explanation}`);
  console.log('-------------------------------------\n');

  // Test 4: Problème critique avec le logement
  console.log('TEST 4: PROBLÈME CRITIQUE');
  const test4Result = await testEmergencyDetection(
    'Il y a une fuite d\'eau importante dans la salle de bain, l\'eau coule du plafond !'
  );
  console.log(`Résultat: ${test4Result.isEmergency ? 'URGENCE' : 'PAS D\'URGENCE'}`);
  console.log(`Type: ${test4Result.emergencyType || 'Aucun'}`);
  console.log(`Explication: ${test4Result.explanation}`);
  console.log('-------------------------------------\n');

  console.log('===== FIN DES TESTS =====');
}

// Fonction pour tester un message spécifique
async function testEmergencyDetection(messageContent) {
  const event = {
    body: JSON.stringify({
      conversationId: `test-${Date.now()}`,
      hostId: 'host-123',
      apartmentId: 'property-123',
      customInstructions: null, // Utiliser les instructions par défaut de la propriété
      messages: [
        {
          content: messageContent,
          direction: 'inbound',
          created_at: new Date().toISOString()
        }
      ]
    })
  };
  
  const response = await handler(event);
  return JSON.parse(response.body);
}

// Exécuter les tests
runTests().catch(console.error);
