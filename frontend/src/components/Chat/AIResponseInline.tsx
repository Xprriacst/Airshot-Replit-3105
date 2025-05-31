import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Button, 
  Paper, 
  TextField, 
  Typography, 
  IconButton,
  CircularProgress 
} from '@mui/material';
import { 
  AutoAwesome, 
  Edit, 
  Send, 
  Close
} from '@mui/icons-material';
// Utiliser le service réel pour la production
import { AIResponseService } from '../../services/ai-response.service';

interface AIResponseInlineProps {
  apartmentId?: string;
  conversationId: string;
  open: boolean;
  onClose: () => void;
  onSend: (response: string) => void;
  onResponseGenerated?: (response: string) => void; // Alias pour onSend, pour compatibilité avec ChatWindow
  guestName?: string;
}

export const AIResponseInline: React.FC<AIResponseInlineProps> = ({
  apartmentId,
  conversationId,
  open,
  onClose,
  onSend,
  onResponseGenerated,
  guestName = ''
}) => {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [editedResponse, setEditedResponse] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);

  const handleGenerate = async () => {
    try {
      console.log('[AIResponseInline] Début de handleGenerate');
      setLoading(true);
      const apartmentIdToUse = apartmentId || '0'; // Utiliser '0' comme valeur par défaut
      console.log('[AIResponseInline] Appel du service avec IDs:', { apartmentIdToUse, conversationId });
      
      const aiResponse = await AIResponseService.generateResponse(apartmentIdToUse, conversationId);
      console.log('[AIResponseInline] Réponse reçue du service:', aiResponse);
      
      if (!aiResponse || aiResponse.trim() === '') {
        console.error('[AIResponseInline] Réponse vide reçue du service');
        // Utiliser une réponse par défaut
        const defaultResponse = "Bonjour ! Je suis là pour vous aider concernant votre réservation. Que puis-je faire pour vous ?"
        setResponse(defaultResponse);
        setEditedResponse(defaultResponse);
      } else {
        setResponse(aiResponse);
        setEditedResponse(aiResponse);
      }
      
      setLoading(false);
      console.log('[AIResponseInline] Génération de réponse terminée avec succès');
    } catch (error) {
      console.error('[AIResponseInline] Erreur lors de la génération de la réponse:', error);
      // En cas d'erreur, utiliser une réponse par défaut
      const fallbackResponse = "Bonjour ! Je suis là pour vous aider concernant votre réservation. N'hésitez pas à me poser vos questions.";
      setResponse(fallbackResponse);
      setEditedResponse(fallbackResponse);
      setLoading(false);
    }
  };

  // Lors du montage initial du composant, préparer une réponse statique en secours
  useEffect(() => {
    console.log('[AIResponseInline] Montage initial du composant');
    // Préparer une réponse statique par défaut
    const defaultResponse = "Bonjour ! Je suis là pour vous aider concernant votre réservation. Que puis-je faire pour vous ?";
    setResponse(defaultResponse);
    setEditedResponse(defaultResponse);
  }, []);

  // Générer automatiquement une réponse quand le composant s'ouvre
  useEffect(() => {
    console.log('[AIResponseInline] useEffect déclenché avec open =', open);
    if (open) {
      console.log('[AIResponseInline] Popup ouverte, génération de réponse...');
      handleGenerate();
    }
  }, [open]);
  
  // S'assurer que la réponse reste affichée
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    
    if (open) {
      console.log('[AIResponseInline] Vérification périodique de visibilité');
      timer = setInterval(() => {
        console.log('[AIResponseInline] Vérification de visibilité:', { open, response, loading });
        if (!response || response.trim() === '') {
          console.log('[AIResponseInline] Pas de réponse, génération forcée');
          handleGenerate();
        }
      }, 1000);
    }
    
    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [open, response, loading]);

  const handleSend = () => {
    console.log('[AIResponseInline] handleSend déclenché avec texte:', editedResponse.slice(0, 30) + '...');
    if (editedResponse.trim()) {
      try {
        // Appeler onResponseGenerated si disponible, sinon onSend
        if (onResponseGenerated) {
          console.log('[AIResponseInline] Utilisation de onResponseGenerated');
          onResponseGenerated(editedResponse);
        } else {
          console.log('[AIResponseInline] Utilisation de onSend (fallback)');
          onSend(editedResponse);
        }
        console.log('[AIResponseInline] Message envoyé avec succès');
      } catch (error) {
        console.error('[AIResponseInline] Erreur lors de l\'envoi du message:', error);
      } finally {
        // Réinitialiser l'état et fermer la popup quelle que soit l'issue
        setResponse(null);
        setEditedResponse('');
        onClose();
      }
    } else {
      console.warn('[AIResponseInline] Tentative d\'envoi d\'un message vide');
    }
  };

  const handleClose = () => {
    setResponse(null);
    setEditedResponse('');
    onClose();
  };

  const toggleEdit = () => {
    setIsEditing(!isEditing);
  };

  console.log('[AIResponseInline] État actuel:', { open, loading, response, isEditing });
  
  // Toujours rendre le composant, mais le cacher via CSS si !open
  // Cela évite les problèmes de montage/démontage

  return (
    <Paper 
      elevation={3} 
      sx={{ 
        width: '100%',         // Utilise toute la largeur disponible
        my: 2,                 // Marge verticale pour espacement
        zIndex: 1000,
        borderRadius: '8px',
        overflow: 'hidden',
        display: open ? 'block' : 'none',
        border: '2px solid #1976d2'
      }}
    >
      <Box 
        sx={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          p: 1,
          bgcolor: 'primary.main',
          color: 'white'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <AutoAwesome sx={{ mr: 1 }} />
          <Typography variant="subtitle1">
            Réponse préparée pour {guestName || 'le client'}
          </Typography>
        </Box>
        <IconButton size="small" onClick={handleClose} sx={{ color: 'white' }}>
          <Close />
        </IconButton>
      </Box>

      <Box sx={{ p: 2, maxHeight: '200px', overflowY: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <CircularProgress size={30} />
          </Box>
        ) : (
          <>
            {isEditing ? (
              <TextField
                fullWidth
                multiline
                minRows={3}
                maxRows={6}
                value={editedResponse}
                onChange={(e) => setEditedResponse(e.target.value)}
                variant="outlined"
                size="small"
              />
            ) : (
              <Typography variant="body1">{editedResponse}</Typography>
            )}
          </>
        )}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1, bgcolor: 'background.paper' }}>
        <Button 
          size="small" 
          onClick={toggleEdit} 
          startIcon={<Edit />}
          sx={{ mr: 1 }}
        >
          {isEditing ? 'Aperçu' : 'Modifier'}
        </Button>
        <Button 
          variant="contained" 
          size="small" 
          onClick={handleSend} 
          startIcon={<Send />}
          disabled={loading || !editedResponse.trim()}
        >
          Envoyer
        </Button>
      </Box>
    </Paper>
  );
};

export default AIResponseInline;
