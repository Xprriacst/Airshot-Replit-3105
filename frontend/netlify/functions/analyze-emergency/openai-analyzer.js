/**
 * Module pour l'analyse avec OpenAI
 */

const OpenAI = require('openai');

// Initialiser le client OpenAI
const getOpenAIClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.error('[analyze-emergency] Erreur: Clé API OpenAI manquante');
    throw new Error('Configuration OpenAI incomplète');
  }
  
  return new OpenAI({
    apiKey: apiKey,
  });
};

// Analyser les messages avec OpenAI
const analyzeWithOpenAI = async (openai, messages) => {
  try {
    console.log('[analyze-emergency] Envoi de la requête à OpenAI...');
    console.log('[analyze-emergency] Nombre de messages envoyés:', messages.length);
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      temperature: 0.2,
      max_tokens: 1000
    });
    
    console.log('[analyze-emergency] Réponse reçue d\'OpenAI');
    
    if (!response.choices || response.choices.length === 0) {
      console.error('[analyze-emergency] Réponse OpenAI invalide:', response);
      throw new Error('Réponse OpenAI invalide');
    }
    
    return response.choices[0].message.content;
  } catch (error) {
    console.error('[analyze-emergency] Erreur lors de l\'appel à OpenAI:', error);
    throw error;
  }
};

module.exports = {
  getOpenAIClient,
  analyzeWithOpenAI
};
