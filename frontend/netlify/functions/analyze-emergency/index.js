/**
 * Fonction principale d'analyse d'urgence
 * Version modulaire
 */

const { getResponseHeaders, parseRequestData, formatAnalysisResult, checkResponseCoherence } = require('./utils');
const { getSupabaseClient, fetchPropertyInfo, fetchConversationMessages, saveAnalysisResult } = require('./data-fetcher');
const { buildPropertyContext, buildSystemPrompt, buildOpenAIMessages } = require('./prompt-builder');
const { getOpenAIClient, analyzeWithOpenAI } = require('./openai-analyzer');

/**
 * Fonction Netlify pour analyser une conversation et détecter les cas d'urgence
 */
exports.handler = async function(event, context) {
  // Activer CORS
  const headers = getResponseHeaders();
  
  // Gérer les requêtes OPTIONS (pre-flight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'OK' }),
    };
  }
  
  try {
    console.log('[analyze-emergency] Début de l\'analyse d\'urgence');
    
    // 1. Parser les données de la requête
    const requestData = parseRequestData(event);
    
    // Extraire les données nécessaires
    const conversationId = requestData.conversationId;
    const hostId = requestData.hostId;
    const propertyId = requestData.apartmentId;
    let aiInstructions = requestData.customInstructions || null;
    
    if (!conversationId) {
      throw new Error('ID de conversation manquant');
    }
    
    console.log(`[analyze-emergency] Analyse de la conversation ID: ${conversationId}`);
    
    // 2. Initialiser les clients
    const supabase = getSupabaseClient();
    const openai = getOpenAIClient();
    
    // 3. Récupérer les informations de la propriété
    const propertyInfo = await fetchPropertyInfo(supabase, propertyId);
    
    // Si des instructions AI personnalisées n'ont pas été fournies, utiliser celles de la propriété
    if (!aiInstructions && propertyInfo && propertyInfo.ai_instructions) {
      aiInstructions = propertyInfo.ai_instructions;
      console.log('[analyze-emergency] Instructions AI récupérées de la propriété, longueur:', aiInstructions.length);
      console.log('[analyze-emergency] Début des instructions de la propriété:', aiInstructions.substring(0, 100) + '...');
    }
    
    // 4. Récupérer les messages de la conversation
    const messages = await fetchConversationMessages(supabase, conversationId, requestData.messages);
    
    // Si aucun message n'est trouvé, retourner un résultat négatif
    if (messages.length === 0) {
      console.log('[analyze-emergency] Aucun message dans la conversation');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          isEmergency: false,
          emergencyType: null,
          confidence: 1.0,
          unknownResponse: false,
          explanation: 'Aucun message à analyser'
        }),
      };
    }
    
    // 5. Construire le contexte de la propriété
    const propertyContext = buildPropertyContext(propertyInfo, aiInstructions);
    
    // 6. Construire le prompt système
    const systemPrompt = buildSystemPrompt(propertyContext, aiInstructions);
    
    // 7. Construire les messages pour OpenAI
    const gptMessages = buildOpenAIMessages(systemPrompt, messages);
    
    // 8. Analyser avec OpenAI
    const gptResponse = await analyzeWithOpenAI(openai, gptMessages);
    
    // 9. Formater les résultats
    let analysisResult = formatAnalysisResult(gptResponse);
    
    // 10. Vérifier la cohérence entre la réponse et les résultats d'analyse
    analysisResult = checkResponseCoherence(analysisResult, messages);
    
    // 11. Enregistrer les résultats dans Supabase
    await saveAnalysisResult(supabase, conversationId, analysisResult);
    
    // 12. Retourner le résultat
    console.log('[analyze-emergency] Analyse terminée avec succès');
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(analysisResult),
    };
  } catch (error) {
    console.error('[analyze-emergency] Erreur lors de l\'analyse d\'urgence:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: `Erreur lors de l'analyse: ${error.message}`,
        isEmergency: false,
        emergencyType: null
      }),
    };
  }
};
