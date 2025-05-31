// Réponses de secours par type d'appartement, utilisées si la fonction Netlify échoue
const FALLBACK_RESPONSES: Record<string, string[]> = {
  // Réponses génériques (ID 0 ou inconnu)
  '0': [
    "Bonjour ! Je serais ravi de vous aider concernant cet appartement. Que souhaitez-vous savoir exactement ?",
    "Merci pour votre message. Avez-vous des questions spécifiques sur l'emplacement, les équipements ou les disponibilités ?",
    "Bonjour ! Je suis à votre disposition pour toute information sur cet appartement. N'hésitez pas à me poser vos questions."
  ],
  // On peut ajouter d'autres IDs d'appartements avec des réponses spécifiques
};

// Interface pour les réponses de l'API
interface AIResponseData {
  response: string;
  isUncertain?: boolean;
}

export class AIResponseService {
  static async generateResponse(apartmentId: string, conversationId: string) {
    console.log('[AIResponseService] Début de generateResponse avec:', { apartmentId, conversationId });
    
    try {
      console.log('[AIResponseService] Envoi de la requête à la fonction Netlify...');
      const response = await fetch('/.netlify/functions/generate-ai-response', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apartmentId,
          conversationId
        })
      });

      console.log('[AIResponseService] Réponse reçue, status:', response.status);
      
      if (!response.ok) {
        console.error('[AIResponseService] Erreur serveur avec status:', response.status);
        // Ne pas essayer de lire le JSON en cas d'erreur 404 ou 500
        throw new Error(`Erreur serveur: ${response.status}`);
      }

      try {
        const data = await response.json() as AIResponseData;
        console.log('[AIResponseService] Données brutes reçues de l\'API:', data);
        
        // Vérification du format de la réponse
        if (!data.response) {
          console.error('[AIResponseService] Format de réponse invalide:', data);
          throw new Error('Format de réponse invalide');
        }
        
        // Vérification supplémentaire pour éviter les réponses de type "Template envoyé"
        if (data.response.startsWith('Template envoyé:')) {
          console.error('[AIResponseService] Réponse invalide (template):', data.response);
          throw new Error('Erreur: La réponse semble être un template, pas une réponse IA');
        }
        
        // Détection d'incertitude
        if (data.isUncertain) {
          console.log('[AIResponseService] Incertitude détectée dans la réponse');
          
          // Notification de l'incertitude au service d'emergency detection
          try {
            this.notifyUncertainty(conversationId);
          } catch (notifyError) {
            console.error('[AIResponseService] Erreur lors de la notification d\'incertitude:', notifyError);
          }
        }
        
        console.log('[AIResponseService] Réponse IA extraite et validée:', data.response);
        return data.response;
      } catch (jsonError) {
        console.error('[AIResponseService] Erreur de parsing JSON:', jsonError);
        throw new Error('Erreur de format de réponse');
      }
    } catch (error) {
      console.error('[AIResponseService] Erreur lors de la génération de la réponse:', error);
      console.log('[AIResponseService] Utilisation d\'une réponse de secours...');
      
      // Utiliser une réponse de secours si la fonction Netlify échoue
      const fallbackResponses = FALLBACK_RESPONSES[apartmentId] || FALLBACK_RESPONSES['0'];
      const randomIndex = Math.floor(Math.random() * fallbackResponses.length);
      return fallbackResponses[randomIndex];
    }
  }
  
  /**
   * Notifie le service de détection d'urgence qu'une incertitude a été détectée
   * @param conversationId L'ID de la conversation concernée
   */
  private static async notifyUncertainty(conversationId: string) {
    console.log('[AIResponseService] Notification d\'incertitude au service de détection d\'urgence');
    
    try {
      // Laisser le service de détection d'urgence vérifier lui-même l'incertitude
      // puisque la fonction Netlify generate-ai-response.ts a déjà enregistré l'incertitude
      // dans la table conversation_analyses
      
      // Trigger manuel de détection d'urgence pour cette conversation si nécessaire
      const response = await fetch('/.netlify/functions/analyze-emergency', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId,
          // Besoin de l'ID de l'hôte pour la fonction analyze-emergency
          // On utilise une valeur générique car le vrai hostId est disponible dans le contexte de la conversation
          hostId: '1',
          // Indicateur que c'est une notification d'incertitude directe
          directUncertainty: true
        })
      });
      
      if (!response.ok) {
        throw new Error(`Erreur lors de la notification d'incertitude: ${response.status}`);
      }
      
      console.log('[AIResponseService] Notification d\'incertitude envoyée avec succès');
    } catch (error) {
      console.error('[AIResponseService] Erreur lors de la notification d\'incertitude:', error);
    }
  }
}