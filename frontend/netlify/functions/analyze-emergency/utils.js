/**
 * Utilitaires pour la fonction d'analyse d'urgence
 */

// Headers CORS pour les réponses
const getResponseHeaders = () => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
});

// Fonction pour extraire les données de la requête
const parseRequestData = (event) => {
  try {
    if (!event.body) {
      throw new Error('Corps de requête vide');
    }
    
    const requestData = JSON.parse(event.body);
    console.log('[analyze-emergency] Données de requête reçues:', JSON.stringify({
      hasConversationId: !!requestData.conversationId,
      hasHostId: !!requestData.hostId,
      hasPropertyId: !!requestData.apartmentId,
      hasCustomInstructions: !!requestData.customInstructions,
      messagesCount: requestData.messages ? requestData.messages.length : 0
    }));
    
    return requestData;
  } catch (error) {
    console.error('[analyze-emergency] Erreur lors du parsing des données de requête:', error);
    throw new Error(`Erreur de format JSON: ${error.message}`);
  }
};

// Fonction pour formater les résultats d'analyse
const formatAnalysisResult = (gptResponse) => {
  try {
    // Essayer de parser la réponse comme JSON
    let analysisResult;
    
    try {
      analysisResult = JSON.parse(gptResponse);
      console.log('[analyze-emergency] Réponse JSON parsée avec succès');
    } catch (jsonError) {
      console.warn('[analyze-emergency] Erreur lors du parsing JSON de la réponse GPT:', jsonError);
      console.log('[analyze-emergency] Tentative d\'extraction de JSON à partir du texte...');
      
      // Essayer d'extraire un objet JSON du texte
      const jsonMatch = gptResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          analysisResult = JSON.parse(jsonMatch[0]);
          console.log('[analyze-emergency] JSON extrait du texte avec succès');
        } catch (extractError) {
          console.error('[analyze-emergency] Échec de l\'extraction JSON:', extractError);
          throw new Error('Format de réponse invalide');
        }
      } else {
        console.error('[analyze-emergency] Aucun JSON trouvé dans la réponse');
        throw new Error('Format de réponse invalide');
      }
    }
    
    // Vérifier que les champs requis sont présents
    if (analysisResult.isEmergency === undefined) {
      console.warn('[analyze-emergency] Champ isEmergency manquant dans la réponse');
      analysisResult.isEmergency = false;
    }
    
    if (!analysisResult.emergencyType && analysisResult.isEmergency) {
      console.warn('[analyze-emergency] Champ emergencyType manquant pour une urgence');
      analysisResult.emergencyType = 'Non spécifié';
    }
    
    if (!analysisResult.explanation) {
      console.warn('[analyze-emergency] Champ explanation manquant');
      analysisResult.explanation = 'Aucune explication fournie';
    }
    
    if (analysisResult.confidence === undefined) {
      console.warn('[analyze-emergency] Champ confidence manquant');
      analysisResult.confidence = 0.5;
    }
    
    if (analysisResult.unknownResponse === undefined) {
      console.warn('[analyze-emergency] Champ unknownResponse manquant');
      analysisResult.unknownResponse = false;
    }
    
    return analysisResult;
  } catch (error) {
    console.error('[analyze-emergency] Erreur lors du formatage des résultats:', error);
    throw error;
  }
};

// Vérifier la cohérence entre la réponse AI et l'analyse
const checkResponseCoherence = (analysisResult, conversationHistory) => {
  if (!conversationHistory || conversationHistory.length === 0) {
    console.log('[analyze-emergency] Impossible de vérifier la cohérence: pas de messages');
    return analysisResult;
  }
  
  const lastMessage = conversationHistory[conversationHistory.length - 1];
  let lastMessageContent = lastMessage ? lastMessage.content : null;
  
  if (!lastMessageContent) {
    console.log('[analyze-emergency] Impossible de vérifier la cohérence: pas de contenu dans le dernier message');
    return analysisResult;
  }
  
  console.log('[analyze-emergency] Vérification de cohérence entre l\'analyse et le message');
  console.log('[analyze-emergency] Dernier message de l\'utilisateur:', lastMessageContent);
  console.log('[analyze-emergency] Résultat de l\'analyse:', JSON.stringify(analysisResult, null, 2));
  
  // Récupérer la dernière réponse de l'IA si elle existe
  const lastAiResponse = conversationHistory.slice().reverse().find(msg => msg.role === 'assistant');
  
  if (!lastAiResponse) {
    console.log('[analyze-emergency] Aucune réponse IA précédente trouvée pour vérifier la cohérence');
    return analysisResult;
  }
  
  console.log('[analyze-emergency] Dernière réponse de l\'IA:', lastAiResponse.content);
  
  let incoherence = false;
  let incoherenceReason = '';
  
  // Cas 1: L'IA affirme avoir une information mais l'analyse indique MANQUE INFORMATION
  if (analysisResult.unknownResponse && lastAiResponse.content && 
      !lastAiResponse.content.toLowerCase().includes('ne sais pas') && 
      !lastAiResponse.content.toLowerCase().includes('ne dispose pas') &&
      !lastAiResponse.content.toLowerCase().includes('pas d\'information')) {
    incoherence = true;
    incoherenceReason = 'L\'IA donne une réponse affirmative alors que l\'information n\'est pas disponible';
    console.warn('[analyze-emergency] Incohérence détectée: réponse affirmative mais information non disponible');
    console.warn('[analyze-emergency] Détails - unknownResponse:', analysisResult.unknownResponse);
    console.warn('[analyze-emergency] Détails - réponse IA:', lastAiResponse.content.substring(0, 150) + '...');
  }
  
  // Cas 2: L'IA dit ne pas avoir d'information mais l'analyse indique RÉPONSE CONNUE
  if (!analysisResult.unknownResponse && analysisResult.emergencyType === 'Réponse connue' && 
      (lastAiResponse.content.toLowerCase().includes('ne sais pas') || 
       lastAiResponse.content.toLowerCase().includes('ne dispose pas') ||
       lastAiResponse.content.toLowerCase().includes('pas d\'information'))) {
    incoherence = true;
    incoherenceReason = 'L\'IA indique ne pas connaître l\'information alors qu\'elle est disponible';
    console.warn('[analyze-emergency] Incohérence détectée: IA incertaine mais information disponible');
    console.warn('[analyze-emergency] Détails - unknownResponse:', analysisResult.unknownResponse);
    console.warn('[analyze-emergency] Détails - emergencyType:', analysisResult.emergencyType);
    console.warn('[analyze-emergency] Détails - réponse IA:', lastAiResponse.content.substring(0, 150) + '...');
  }
  
  // Signaler l'incohérence si détectée
  if (incoherence) {
    analysisResult.hasIncoherence = true;
    analysisResult.incoherenceReason = incoherenceReason;
    
    // Augmenter le niveau d'urgence si incohérence
    if (!analysisResult.isEmergency) {
      analysisResult.isEmergency = true;
      analysisResult.emergencyType = 'Incohérence IA';
      console.log('[analyze-emergency] Incohérence détectée, niveau d\'urgence augmenté');
    }
    
    // Log détaillé de l'incohérence
    console.log('[analyze-emergency] Détail de l\'incohérence:');
    console.log('- Message utilisateur:', lastMessageContent);
    console.log('- Réponse IA:', lastAiResponse.content);
    console.log('- Analyse:', JSON.stringify(analysisResult, null, 2));
    console.log('- Raison de l\'incohérence:', incoherenceReason);
  } else {
    analysisResult.hasIncoherence = false;
    console.log('[analyze-emergency] Aucune incohérence détectée entre la réponse et l\'analyse');
  }
  
  return analysisResult;
};

module.exports = {
  getResponseHeaders,
  parseRequestData,
  formatAnalysisResult,
  checkResponseCoherence
};
