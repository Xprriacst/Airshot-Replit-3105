const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// Initialisation des clients
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log('[test-ai-uncertainty] Initialisation Supabase avec URL:', supabaseUrl ? supabaseUrl.substring(0, 10) + '...' : 'undefined');
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Initialisation de l'API OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Headers CORS
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

/**
 * Fonction de test pour l'incertitude de l'IA
 */
exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('[test-ai-uncertainty] Début du test');
    
    // Récupérer les données de la requête
    const requestData = JSON.parse(event.body || '{}');
    const { testQuestion } = requestData;
    
    const question = testQuestion || "Quel est le code d'accès à l'immeuble ? Y a-t-il un parking privé ?";
    
    console.log('[test-ai-uncertainty] Question de test:', question);

    // Créer un message de test
    const testMessages = [
      {
        role: 'system',
        content: `Tu es un assistant virtuel professionnel pour un hôte Airbnb. 

IMPORTANT - PROTOCOLE D'INCERTITUDE:
Si tu n'es pas certain d'une information ou si tu ne la connais pas:
1. Fournis TOUJOURS une réponse polie et utile au client (jamais "je ne sais pas" directement)
2. Si tu n'as pas l'information demandée, propose une alternative comme "Je vais vérifier avec l'hôte et vous revenir rapidement"
3. En fin de ta réponse, ajoute UN UNIQUE caractère Unicode invisible: '\\u200B' (zero-width space) qui sera utilisé comme signal d'incertitude

Ce caractère spécial est crucial car il permet d'alerter l'hôte humain sans que le client ne le voit. N'utilise ce caractère QUE si tu es incertain de l'information.

Instructions générales:
1. Réponds de manière personnalisée et spécifique
2. Utilise les informations fournies sur la propriété
3. Sois chaleureux et professionnel
4. Concentre-toi sur les besoins exprimés par l'invité
5. Utilise un ton conversationnel naturel`
      },
      {
        role: 'user',
        content: question
      },
      {
        role: 'system',
        content: `RAPPEL IMPORTANT: Si tu n'es pas certain d'une information ou si l'information demandée n'est pas présente dans le contexte, ajoute le caractère \\u200B (zero-width space) à la fin de ta réponse. Ce caractère ne sera pas visible pour l'utilisateur mais permettra d'alerter l'hôte humain. Fournis toujours une réponse utile, même en cas d'incertitude.`
      }
    ];

    // Appeler l'API OpenAI pour tester
    console.log('[test-ai-uncertainty] Appel de l\'API OpenAI...');
    
    // Conversion des messages au format attendu par l'API OpenAI
    const openAiMessages = testMessages.map(msg => {
      const role = ['system', 'user', 'assistant'].includes(msg.role) ? 
                  msg.role : 'system';
      
      return {
        role,
        content: msg.content
      };
    });
    
    // Appel à l'API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: openAiMessages,
      temperature: 0.8,
      max_tokens: 250,
    });

    // Récupérer la réponse
    const aiResponse = completion.choices[0].message.content;
    
    // Vérifier si la réponse contient le marqueur d'incertitude
    const hasUncertaintyMarker = aiResponse.includes('\u200B');
    const cleanedResponse = aiResponse.replace(/\u200B/g, '');
    
    console.log('[test-ai-uncertainty] Réponse générée:', cleanedResponse);
    console.log('[test-ai-uncertainty] Incertitude détectée:', hasUncertaintyMarker ? 'OUI' : 'NON');

    // Si incertitude détectée, l'enregistrer dans la base de données
    if (hasUncertaintyMarker) {
      try {
        console.log('[test-ai-uncertainty] Enregistrement de l\'incertitude dans la base de données...');
        
        const { error: uncertaintyError } = await supabase
          .from('conversation_analyses')
          .insert({
            conversation_id: 'test-uncertainty-detection',
            is_emergency: true,
            emergency_type: 'IA incertaine',
            confidence: 0.9,
            unknown_response: true,
            explanation: 'Test: L\'IA a signalé son incertitude lors de la génération de réponse',
            created_at: new Date().toISOString()
          });
        
        if (uncertaintyError) {
          console.error('[test-ai-uncertainty] Erreur lors de l\'enregistrement de l\'incertitude:', uncertaintyError);
        } else {
          console.log('[test-ai-uncertainty] Incertitude enregistrée avec succès');
        }
      } catch (uncertaintyDbError) {
        console.error('[test-ai-uncertainty] Erreur lors de la gestion de l\'incertitude:', uncertaintyDbError);
      }
    }

    // Retourner les résultats du test
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        originalQuestion: question,
        aiResponse: cleanedResponse,
        isUncertain: hasUncertaintyMarker,
        test: 'Fonctionnalité de détection d\'incertitude',
        result: hasUncertaintyMarker ? 'SUCCÈS: Incertitude détectée' : 'ÉCHEC: Incertitude non détectée'
      })
    };
  } catch (error) {
    console.error('[test-ai-uncertainty] Erreur lors du test:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: `Erreur lors du test: ${error.message}`,
        test: 'Fonctionnalité de détection d\'incertitude',
        result: 'ÉCHEC: Erreur durant le test'
      })
    };
  }
};
