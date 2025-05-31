/**
 * Module pour construire les prompts d'analyse d'urgence
 */

// Construire le contexte de la propriété pour l'analyse
const buildPropertyContext = (propertyInfo, aiInstructions) => {
  let propertyContext = '';
  let customFields = '';
  
  // Vérifier si des informations sur la propriété sont disponibles
  if (propertyInfo) {
    // Extraire les champs personnalisés qui pourraient contenir des informations utiles
    const customFieldKeys = Object.keys(propertyInfo).filter(key => 
      !['id', 'name', 'address', 'amenities', 'house_rules', 'faq', 'ai_instructions', 'created_at', 'updated_at'].includes(key)
    );
    
    if (customFieldKeys.length > 0) {
      console.log('[analyze-emergency] Champs personnalisés détectés:', customFieldKeys);
      
      // Formater les champs personnalisés
      customFields = customFieldKeys.map(key => {
        const value = propertyInfo[key];
        if (value && typeof value === 'string') {
          return `${key}: ${value}`;
        } else if (value && typeof value === 'object') {
          try {
            return `${key}: ${JSON.stringify(value)}`;
          } catch (e) {
            return `${key}: [Objet complexe]`;
          }
        }
        return null;
      }).filter(Boolean).join('\\n');
    }
    
    propertyContext = `
===============================================
INFORMATIONS SUR LE LOGEMENT
===============================================

Nom: "${propertyInfo.name || 'Logement sans nom'}"
Adresse: "${propertyInfo.address || 'Adresse non spécifiée'}"

ÉQUIPEMENTS MENTIONNÉS:
${propertyInfo.amenities || 'Aucun équipement spécifié'}

RÈGLES DE LA MAISON:
${propertyInfo.house_rules || 'Aucune règle spécifiée'}

QUESTIONS FRÉQUENTES:
${propertyInfo.faq || 'Aucune FAQ spécifiée'}
`;
    
    // Ajouter les champs personnalisés s'il y en a
    if (customFields) {
      propertyContext += `
===============================================
INFORMATIONS PERSONNALISÉES
===============================================

${customFields}
`;
    }
    
    // Ajouter explicitement les informations sur le restaurant si elles existent
    // Cette section est conservée pour la rétrocompatibilité mais sera éventuellement supprimée
    if (propertyInfo.meilleur_restau || propertyInfo.meilleur_restaurant || 
        (propertyInfo.recommendations && propertyInfo.recommendations.restaurant) ||
        Object.keys(propertyInfo).some(key => key.toLowerCase().includes('resto') || key.toLowerCase().includes('restaurant'))) {
      
      console.log('[analyze-emergency] Information sur le restaurant dans les champs personnalisés, ajout au contexte');
      
      let restaurantInfo = '';
      
      // Chercher le nom du restaurant dans différents champs possibles
      if (propertyInfo.meilleur_restau) {
        restaurantInfo = propertyInfo.meilleur_restau;
      } else if (propertyInfo.meilleur_restaurant) {
        restaurantInfo = propertyInfo.meilleur_restaurant;
      } else if (propertyInfo.recommendations && propertyInfo.recommendations.restaurant) {
        restaurantInfo = propertyInfo.recommendations.restaurant;
      } else {
        // Chercher dans tous les champs qui contiennent 'resto' ou 'restaurant'
        for (const [key, value] of Object.entries(propertyInfo)) {
          if ((key.toLowerCase().includes('resto') || key.toLowerCase().includes('restaurant')) && value) {
            restaurantInfo = value;
            break;
          }
        }
      }
      
      // Ajouter discrètement l'information sans créer de section dédiée
      propertyContext += `\n\n⚠️ INFORMATION COMPLÉMENTAIRE: Meilleur restaurant recommandé : ${restaurantInfo}`;
    }
  } else {
    console.warn('[analyze-emergency] Aucune information sur le logement disponible, l\'analyse sera moins précise');
    propertyContext = `
===============================================
AUCUNE INFORMATION DISPONIBLE
===============================================

Aucune information spécifique sur le logement n'est disponible.
Toutes les questions concernant des détails spécifiques du logement doivent être classées comme "MANQUE INFORMATION".
`;
  }
  
  console.log('[analyze-emergency] Contexte de propriété construit, longueur:', propertyContext.length);
  console.log('[analyze-emergency] Début du contexte:', propertyContext.substring(0, 200) + '...');
  
  return propertyContext;
};

// Construire le prompt système pour l'analyse d'urgence
const buildSystemPrompt = (propertyContext, aiInstructions) => {
  const systemPrompt = `Tu es un assistant spécialisé dans l'analyse de conversations entre un hôte et un invité dans le contexte d'une location de logement. 
        
Ton rôle est d'analyser les messages et de les classer dans l'une des 3 catégories suivantes :

1. "RÉPONSE CONNUE" : L'information demandée est EXPLICITEMENT présente dans les instructions de l'appartement → Pas d'alerte nécessaire.
2. "MANQUE INFORMATION" : L'information demandée n'est PAS EXPLICITEMENT présente dans les instructions de l'appartement → Nécessite un email à l'hôte.
3. "PROBLÈME" : Le client est mécontent ou il y a un problème dans le logement → Nécessite un email à l'hôte.

Détails des catégories :

CATÉGORIE 1 - "RÉPONSE CONNUE" (isEmergency = false) :
- Les demandes dont les réponses sont disponibles dans les instructions fournies
- Important : Recherche attentivement dans TOUTES les sections des instructions AI
- L'information recherchée peut apparaître dans n'importe quelle partie du texte, même si elle n'est pas dans une section dédiée
- Exemples concrets :
  * Si l'invité demande "Y a-t-il un parking ?" et que les instructions mentionnent "Il y a un parking dans le logement" ou "Parking disponible", c'est une RÉPONSE CONNUE
  * Si l'invité demande "Où est le code WiFi ?" et que les instructions indiquent "Code WiFi : ABC123", c'est une RÉPONSE CONNUE
  * Si l'invité demande "Pouvez-vous recommander un restaurant ?" et que les instructions mentionnent des restaurants, c'est une RÉPONSE CONNUE
- Même si l'information n'est pas dans une section dédiée, si elle existe quelque part dans les instructions, c'est une RÉPONSE CONNUE
- Salutations ou remerciements simples

CATÉGORIE 2 - "MANQUE INFORMATION" (isEmergency = true, emergencyType = "IA incertaine", unknownResponse = true) :
- Questions dont la réponse n'est ABSOLUMENT PAS MENTIONNÉE, même indirectement, dans les instructions fournies
- UNIQUEMENT si tu as examiné attentivement l'intégralité des instructions et que l'information demandée n'y figure NULLE PART
- Même si la réponse te semble évidente ou de bon sens, si elle n'est pas dans les instructions, c'est "MANQUE INFORMATION"
- Exemples: "Y a-t-il un sèche-cheveux?" (si pas mentionné dans les instructions), "Où se trouve le supermarché le plus proche?" (si pas indiqué)

CATÉGORIE 3 - "PROBLÈME" (isEmergency = true, emergencyType selon le cas) :
- Messages exprimant un mécontentement (emergencyType = "Client mécontent")
- Messages signalant un problème avec le logement (emergencyType = "Problème avec le logement")
- Messages signalant une urgence critique comme une fuite d'eau, une panne de chauffage, etc. (emergencyType = "Urgence critique")
- Exemples: "Le chauffage ne fonctionne pas", "Il y a une fuite d'eau", "Je suis très déçu par la propreté"

INSTRUCTIONS POUR L'ANALYSE :
1. Examine attentivement le dernier message de l'invité et son contexte
2. Compare avec les informations disponibles sur le logement
3. Détermine si l'information demandée est explicitement présente dans les instructions
4. Classe le message dans l'une des 3 catégories
5. Fournis une explication détaillée de ton raisonnement
6. Si c'est un "PROBLÈME", précise le niveau d'urgence (critique, problème avec le logement, client mécontent)

INFORMATIONS SUR LE LOGEMENT :
${propertyContext}

${aiInstructions ? `
INSTRUCTIONS AI PERSONNALISÉES :
${aiInstructions}
` : ''}

RÉPONDS AU FORMAT JSON UNIQUEMENT avec les champs suivants :
{
  "isEmergency": boolean,
  "emergencyType": string | null,
  "confidence": number,
  "unknownResponse": boolean,
  "explanation": string,
  "suggestedResponse": string | null
}

- isEmergency: true si c'est une urgence (MANQUE INFORMATION ou PROBLÈME), false sinon
- emergencyType: "IA incertaine", "Client mécontent", "Problème avec le logement", "Urgence critique", "Réponse connue", ou null
- confidence: niveau de confiance entre 0 et 1
- unknownResponse: true si l'information demandée n'est pas disponible dans les instructions
- explanation: explication détaillée de ton analyse
- suggestedResponse: suggestion de réponse à l'invité (optionnel)`;

  return systemPrompt;
};

// Construire les messages pour l'API OpenAI
const buildOpenAIMessages = (systemPrompt, conversationHistory) => {
  // Convertir l'historique de conversation au format attendu par OpenAI
  const formattedHistory = conversationHistory.map(msg => {
    // Déterminer le rôle en fonction de la direction du message
    const role = msg.direction === 'inbound' ? 'user' : 'assistant';
    return {
      role,
      content: msg.content
    };
  });
  
  // Ajouter le prompt système en premier
  const messages = [
    {
      role: 'system',
      content: systemPrompt
    },
    ...formattedHistory
  ];
  
  return messages;
};

module.exports = {
  buildPropertyContext,
  buildSystemPrompt,
  buildOpenAIMessages
};
