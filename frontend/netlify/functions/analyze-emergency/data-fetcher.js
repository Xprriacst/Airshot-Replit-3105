/**
 * Module pour récupérer les données nécessaires à l'analyse d'urgence
 */

const { createClient } = require('@supabase/supabase-js');

// Initialisation du client Supabase
const getSupabaseClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[analyze-emergency] Erreur: Variables d\'environnement Supabase manquantes');
    throw new Error('Configuration Supabase incomplète');
  }
  
  console.log('[analyze-emergency] Initialisation Supabase avec URL:', supabaseUrl ? supabaseUrl.substring(0, 10) + '...' : 'undefined');
  return createClient(supabaseUrl, supabaseServiceKey);
};

// Récupérer les informations de la propriété
const fetchPropertyInfo = async (supabase, propertyId) => {
  if (!propertyId) {
    console.warn('[analyze-emergency] Aucun ID de propriété disponible');
    return null;
  }
  
  try {
    console.log(`[analyze-emergency] Récupération des informations pour la propriété ID: ${propertyId}`);
    
    const { data: property, error } = await supabase
      .from('properties')
      .select('*')
      .eq('id', propertyId)
      .single();
    
    if (error) {
      console.error('[analyze-emergency] Erreur lors de la récupération des informations de la propriété:', error);
      return null;
    }
    
    if (!property) {
      console.warn(`[analyze-emergency] Aucune propriété trouvée avec l'ID: ${propertyId}`);
      return null;
    }
    
    // Loguer les clés de propriété disponibles pour le débogage
    console.log('[analyze-emergency] Champs de propriété disponibles:', Object.keys(property));
    
    console.log('[analyze-emergency] Informations récupérées:', JSON.stringify({
      hasName: !!property.name,
      hasAddress: !!property.address,
      hasAmenities: !!property.amenities,
      hasRules: !!property.house_rules,
      hasFAQ: !!property.faq,
      hasInstructions: !!property.ai_instructions,
      // Loguer les champs personnalisés potentiellement utiles
      hasCustomFields: Object.keys(property).filter(key => 
        !['id', 'name', 'address', 'amenities', 'house_rules', 'faq', 'ai_instructions', 'created_at', 'updated_at'].includes(key)
      )
    }));
    
    return property;
  } catch (error) {
    console.error('[analyze-emergency] Erreur lors de la récupération des informations de la propriété:', error);
    return null;
  }
};

// Récupérer les messages de la conversation
const fetchConversationMessages = async (supabase, conversationId, requestMessages) => {
  // Vérifier si des messages de test ont été fournis dans la requête
  if (requestMessages && Array.isArray(requestMessages)) {
    console.log('[analyze-emergency] Utilisation des messages de test fournis dans la requête');
    return requestMessages;
  }
  
  try {
    // Récupérer les messages récents de la conversation depuis la base de données
    const { data: dbMessages, error } = await supabase
      .from('messages')
      .select('content, direction, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) {
      console.error('[analyze-emergency] Erreur lors de la récupération des messages:', error);
      throw new Error(`Erreur lors de la récupération des messages: ${error.message}`);
    }
    
    return dbMessages || [];
  } catch (error) {
    console.error('[analyze-emergency] Erreur lors de la récupération des messages:', error);
    throw error;
  }
};

// Enregistrer les résultats de l'analyse dans Supabase
const saveAnalysisResult = async (supabase, conversationId, analysisResult) => {
  try {
    // Préparer les données pour l'insertion
    const analysisDbData = {
      conversation_id: conversationId,
      is_emergency: analysisResult.isEmergency,
      emergency_type: analysisResult.emergencyType,
      confidence: analysisResult.confidence,
      unknown_response: analysisResult.unknownResponse,
      explanation: analysisResult.explanation,
      created_at: new Date().toISOString(),
      response_suggested: analysisResult.suggestedResponse || null,
      has_incoherence: analysisResult.hasIncoherence || false,
      incoherence_reason: analysisResult.incoherenceReason || null
    };
    
    const { data: analysisInsertedData, error: analysisError } = await supabase
      .from('conversation_analyses')
      .insert(analysisDbData)
      .select()
      .single();
    
    if (analysisError) {
      console.error('[analyze-emergency] Erreur lors de l\'enregistrement de l\'analyse:', analysisError);
      return null;
    } else {
      console.log('[analyze-emergency] Analyse enregistrée avec l\'ID:', analysisInsertedData.id);
      return analysisInsertedData;
    }
  } catch (dbError) {
    console.error('[analyze-emergency] Erreur lors de l\'enregistrement de l\'analyse:', dbError);
    return null;
  }
};

module.exports = {
  getSupabaseClient,
  fetchPropertyInfo,
  fetchConversationMessages,
  saveAnalysisResult
};
