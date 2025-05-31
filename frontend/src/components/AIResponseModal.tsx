import { useState, useEffect } from 'react';
import { AIResponseService } from '../services/ai-response.service';
import './AIResponseModal.css';
import { AutoAwesome, Send, Edit, Close } from '@mui/icons-material';

interface AIResponseModalProps {
  apartmentId?: string; // Optional pour compatibilité avec l'usage actuel
  conversationId: string;
  onResponseGenerated?: (response: string) => void; // Alias pour onSend
  onSend?: (response: string) => void;
  onClose: () => void;
  open: boolean; // Nouveau prop pour contrôler l'ouverture
  guestName?: string; // Nom de l'invité pour personnalisation
}

export default function AIResponseModal({ 
  apartmentId, 
  conversationId, 
  onSend, 
  onResponseGenerated,
  onClose, 
  open,
  guestName = ''
}: AIResponseModalProps) {
  const [response, setResponse] = useState('');
  const [editedResponse, setEditedResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Mettre à jour la réponse éditée quand la réponse originale change
  useEffect(() => {
    setEditedResponse(response);
    setIsEditing(false); // Réinitialiser l'état d'édition
  }, [response]);

  const handleGenerate = async () => {
    console.log('Génération démarrée avec:', { apartmentId, conversationId });
    try {
      setLoading(true);
      setError('');
      setResponse(''); // Réinitialiser toute réponse existante
      setEditedResponse(''); // Réinitialiser également la réponse éditée
      
      console.log('Appel du service AI...');
      // S'assurer que apartmentId a une valeur par défaut si non fourni
      const apartmentIdToUse = apartmentId || 'default';
      const aiResponse = await AIResponseService.generateResponse(
        apartmentIdToUse, 
        conversationId
      );
      
      console.log('Réponse IA reçue avec succès:', aiResponse);
      
      // Validation supplémentaire de la réponse
      if (!aiResponse || aiResponse.trim() === '') {
        throw new Error('La réponse générée est vide');
      }
      
      if (aiResponse.startsWith('Template envoyé:')) {
        throw new Error('Type de réponse incorrect');
      }
      
      setResponse(aiResponse);
      setEditedResponse(aiResponse);
    } catch (err: any) {
      console.error('Erreur lors de la génération:', err);
      setError(err.message || 'Erreur de génération');
      setResponse(''); // Réinitialiser en cas d'erreur
      setEditedResponse(''); // Réinitialiser également la réponse éditée
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => {
    if (!editedResponse.trim()) {
      setError('La réponse est vide. Veuillez générer une réponse avant d\'envoyer.');
      return;
    }
    
    console.log('Envoi de la réponse IA (éditée):', editedResponse);
    
    // Envoyer la réponse éditée au parent (utiliser onResponseGenerated ou onSend)
    if (onResponseGenerated) {
      onResponseGenerated(editedResponse);
    } else if (onSend) {
      onSend(editedResponse);
    }
    
    // Fermer la modal
    onClose();
  };

  // Gérer les modifications du texte
  const handleResponseChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedResponse(e.target.value);
    setIsEditing(true);
  };
  
  // Réinitialiser les modifications
  const handleResetEdits = () => {
    setEditedResponse(response);
    setIsEditing(false);
  };

  // Si le modal n'est pas ouvert, ne rien rendre
  if (!open) return null;
  
  return (
    <div className="ai-modal-overlay">
      <div className="ai-modal">
        <div className="ai-modal-header">
          <h3>Réponse IA</h3>
          <button onClick={onClose} className="close-btn">
            <Close />
          </button>
        </div>

        <div className="ai-modal-content">
          {!response && !loading && (
            <div className="generate-section">
              <p>Générer une réponse personnalisée{guestName ? ` pour ${guestName}` : ''} avec l'IA</p>
              <button 
                onClick={handleGenerate} 
                className="generate-btn"
                disabled={loading}
              >
                <AutoAwesome fontSize="small" />
                {loading ? 'Génération...' : 'Générer'}
              </button>
            </div>
          )}

          {loading && (
            <div className="loading-section">
              <div className="loading-spinner"></div>
              <p>L'IA génère votre réponse...</p>
            </div>
          )}

          {error && (
            <div className="error-section">
              <p className="error-message">{error}</p>
              <button onClick={handleGenerate} className="retry-btn">
                Réessayer
              </button>
            </div>
          )}

          {response && (
            <div className="response-section">
              <textarea 
                className="response-preview editable"
                value={editedResponse}
                onChange={handleResponseChange}
                rows={8}
              />
              <div className="action-buttons">
                <button onClick={handleSend} className="send-btn">
                  <Send fontSize="small" />
                  Envoyer
                </button>
                {isEditing && (
                  <button onClick={handleResetEdits} className="reset-btn">
                    <AutoAwesome fontSize="small" />
                    Annuler les modifications
                  </button>
                )}
                <button onClick={() => setResponse('')} className="edit-btn">
                  <Edit fontSize="small" />
                  Régénérer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}