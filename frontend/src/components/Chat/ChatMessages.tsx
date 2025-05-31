import { useEffect, useRef, useState } from 'react';
import { Box, Typography, Paper, Chip, Avatar, Tooltip, useTheme, CircularProgress, Badge } from '@mui/material';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningIcon from '@mui/icons-material/Warning';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import { Message } from '../../services/chat/message.service';
import { supabase } from '../../lib/supabase';

// Préfixe pour les logs liés à ce composant
const DEBUG_PREFIX = 'DEBUG_CHAT_MESSAGES';

interface ChatMessagesProps {
  messages: Message[];
  isInitialLoad: boolean;
}

interface EmergencyAnalysis {
  id: string;
  conversation_id: string;
  message_content: string;
  is_emergency: boolean;
  emergency_type: string | null;
  confidence: number;
  unknown_response: boolean;
  explanation: string;
  created_at: string;
}

type MessageWithEmergency = Message & {
  isEmergency?: boolean;
  emergencyType?: string | null;
  unknownResponse?: boolean;
};

export default function ChatMessages({ messages, isInitialLoad }: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(isInitialLoad);
  const theme = useTheme();
  const [messagesWithEmergency, setMessagesWithEmergency] = useState<MessageWithEmergency[]>([]);
  
  // Log important pour déboguer
  console.log(`${DEBUG_PREFIX} Re-rendu avec ${messages.length} messages`);
  
  // Afficher les IDs des 5 premiers messages pour débogage
  if (messages.length > 0) {
    const messagesToLog = messages.slice(0, Math.min(5, messages.length));
    console.log(`${DEBUG_PREFIX} Premiers messages:`, messagesToLog.map(m => ({ id: m.id, content: m.content })));
  }

  // Fonction pour formater la date du message
  const formatMessageDate = (date: string): string => {
    try {
      const messageDate = new Date(date);
      if (isToday(messageDate)) {
        return "Aujourd'hui";
      } else if (isYesterday(messageDate)) {
        return "Hier";
      } else {
        return format(messageDate, 'EEEE d MMMM', { locale: fr });
      }
    } catch (error) {
      console.error(`${DEBUG_PREFIX} Erreur lors du formatage de la date:`, error, date);
      return 'Date inconnue';
    }
  };

  // Défilement automatique vers le bas
  const scrollToBottom = (instant = false) => {
    try {
      messagesEndRef.current?.scrollIntoView({
        behavior: instant ? 'auto' : 'smooth'
      });
    } catch (error) {
      console.error(`${DEBUG_PREFIX} Erreur lors du défilement:`, error);
    }
  };

  // Récupération des analyses d'urgence pour la conversation
  const fetchEmergencyAnalyses = async () => {
    if (!messages.length || !messages[0].conversation_id) return;
    
    try {
      console.log(`${DEBUG_PREFIX} Récupération des analyses d'urgence pour la conversation ${messages[0].conversation_id}`);
      
      const { data, error } = await supabase
        .from('conversation_analyses')
        .select('*')
        .eq('conversation_id', messages[0].conversation_id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error(`${DEBUG_PREFIX} Erreur lors de la récupération des analyses d'urgence:`, error);
        return;
      }
      
      if (!data || data.length === 0) {
        console.log(`${DEBUG_PREFIX} Aucune analyse d'urgence trouvée`);
        return;
      }
      
      console.log(`${DEBUG_PREFIX} ${data.length} analyses d'urgence récupérées:`, data);
      
      // Définir les mots-clés pour filtrer les faux positifs courants dans les informations générales
      const commonNonEmergencyKeywords = [
        'restaurant', 'commerces', 'magasin', 'boutique', 'supermarché', 'café', 'bar',
        'recommand', 'conseil', 'suggestion', 'adresse', 'emplacement',
        'visite', 'activité', 'tourisme', 'attraits', 'visiter',
        'transport', 'métro', 'bus', 'tram', 'taxi',
        'merci', 'bonjour', 'salut', 'bonsoir'
      ];

      // Association des analyses aux messages correspondants
      const enrichedMessages = messages.map(msg => {
        // Ignorer les messages sortants (de l'hôte)
        if (msg.direction !== 'inbound') {
          return msg;
        }
        
        // 1. Correspondance directe par contenu - Méthode la plus fiable
        let matchingAnalysis = data.find((analysis: EmergencyAnalysis) => 
          analysis.message_content === msg.content
        );
        
        // 2. Si pas de correspondance directe, essayer de normaliser les espaces
        if (!matchingAnalysis) {
          const normalizedContent = msg.content.replace(/\s+/g, ' ').trim();
          matchingAnalysis = data.find((analysis: EmergencyAnalysis) => 
            analysis.message_content && analysis.message_content.replace(/\s+/g, ' ').trim() === normalizedContent
          );
        }
        
        // 3. Correspondance par timestamp (uniquement pour les messages récents)
        // Cette méthode est plus fiable que la correspondance par sous-chaîne
        if (!matchingAnalysis) {
          const msgTimestamp = new Date(msg.created_at).getTime();
          const now = new Date().getTime();
          
          // Seulement pour les messages de moins de 5 minutes
          if ((now - msgTimestamp) < 5 * 60 * 1000) {
            // Chercher les analyses créées peu après le message (2 minutes max)
            matchingAnalysis = data.find((analysis: EmergencyAnalysis) => {
              const analysisTimestamp = new Date(analysis.created_at).getTime();
              // L'analyse doit être créée APRÈS le message (avec 5 sec de marge)
              return analysisTimestamp >= (msgTimestamp - 5000) && 
                     (analysisTimestamp - msgTimestamp) < 2 * 60 * 1000; // 2 minutes max
            });
          }
        }
        
        // Si une analyse correspondante est trouvée, vérifier qu'il ne s'agit pas d'un faux positif
        if (matchingAnalysis && matchingAnalysis.is_emergency) {
          // Vérifier si le message contient des mots-clés courants non urgents
          const isLikelyNonEmergency = commonNonEmergencyKeywords.some(keyword => 
            msg.content.toLowerCase().includes(keyword.toLowerCase())
          );
          
          // Si c'est une demande d'information générale, mais marquée comme "IA incertaine",
          // considérer comme un faux positif
          if (isLikelyNonEmergency && matchingAnalysis.emergency_type === 'IA incertaine') {
            console.log(`${DEBUG_PREFIX} Faux positif probable détecté:`, {
              messageId: msg.id,
              content: msg.content,
              emergencyType: matchingAnalysis.emergency_type
            });
            // Ignorer cette analyse et retourner le message sans marquage d'urgence
            return msg;
          }
        }
        
        if (matchingAnalysis) {
          console.log(`${DEBUG_PREFIX} Analyse d'urgence trouvée pour le message:`, {
            messageId: msg.id,
            analysisId: matchingAnalysis.id,
            isEmergency: matchingAnalysis.is_emergency,
            emergencyType: matchingAnalysis.emergency_type
          });
          
          return {
            ...msg,
            isEmergency: matchingAnalysis.is_emergency,
            emergencyType: matchingAnalysis.emergency_type,
            unknownResponse: matchingAnalysis.unknown_response
          };
        }
        
        // Si c'est un message entrant, ajoutons des logs supplémentaires pour déboguer
        if (msg.direction === 'inbound') {
          console.log(`${DEBUG_PREFIX} Message entrant sans analyse d'urgence correspondante:`, {
            messageId: msg.id,
            content: msg.content?.substring(0, 30) + '...',
            allAnalysisContents: data.map(a => a.message_content?.substring(0, 30) + '...'),
          });
        }
        
        return msg;
      });
      
      // Vérifier le nombre de messages avec urgence
      const messagesWithEmergency = enrichedMessages.filter(m => (m as MessageWithEmergency).isEmergency);
      console.log(`${DEBUG_PREFIX} ${messagesWithEmergency.length} messages avec urgence détectés sur ${enrichedMessages.length} messages au total`);
      
      setMessagesWithEmergency(enrichedMessages);
    } catch (error) {
      console.error(`${DEBUG_PREFIX} Erreur lors de la récupération des analyses d'urgence:`, error);
    }
  };
  
  // Effet pour récupérer les analyses d'urgence
  useEffect(() => {
    if (messages.length > 0) {
      fetchEmergencyAnalyses();
    }
  }, [messages]);

  // Effet pour le défilement automatique
  useEffect(() => {
    console.log(`${DEBUG_PREFIX} useEffect déclenché - messages.length: ${messages.length}, isInitialLoad: ${isInitialLoad}`);
    
    if (messages.length > 0) {
      if (isInitialLoad) {
        console.log(`${DEBUG_PREFIX} Chargement initial - défilement immédiat`);
        scrollToBottom(true);
        // Délai pour simuler le chargement et améliorer l'UX
        const timer = setTimeout(() => {
          setLoading(false);
        }, 500);
        return () => clearTimeout(timer);
      } else {
        const scrollContainer = messagesEndRef.current?.parentElement;
        if (scrollContainer) {
          try {
            const isAtBottom = Math.abs(
              (scrollContainer.scrollHeight - scrollContainer.scrollTop) - scrollContainer.clientHeight
            ) < 50;
            
            console.log(`${DEBUG_PREFIX} État du défilement:`, { 
              scrollHeight: scrollContainer.scrollHeight,
              scrollTop: scrollContainer.scrollTop,
              clientHeight: scrollContainer.clientHeight,
              isAtBottom
            });
            
            if (isAtBottom) {
              scrollToBottom();
            }
          } catch (error) {
            console.error(`${DEBUG_PREFIX} Erreur lors du calcul de la position de défilement:`, error);
          }
        }
      }
    }
  }, [messages, isInitialLoad]);

  // Fonction pour créer des groupes de messages par date
  const createMessageGroups = () => {
    // Utiliser les messages enrichis s'ils sont disponibles, sinon utiliser les messages originaux
    const messagesToDisplay = messagesWithEmergency.length > 0 ? messagesWithEmergency : messages;
    
    console.log(`${DEBUG_PREFIX} Création des groupes de messages, ${messagesToDisplay.length} messages`); 
    
    if (!Array.isArray(messagesToDisplay)) {
      console.error(`${DEBUG_PREFIX} messages n'est pas un tableau:`, messagesToDisplay);
      return [];
    }
    
    try {
      const messagesToDisplay = messagesWithEmergency.length > 0 ? messagesWithEmergency : messages;
      return messagesToDisplay.reduce((messageGroups: React.ReactNode[], message, index) => {
        // Vérifier que le message est valide
        if (!message || !message.created_at) {
          console.error(`${DEBUG_PREFIX} Message invalide:`, message);
          return messageGroups;
        }
        
        // Vérifier si un nouveau groupe de date est nécessaire
        const showDateSeparator = index === 0 || !isSameDay(
          new Date(message.created_at),
          new Date(messagesToDisplay[index - 1].created_at)
        );
        
        // Si nécessaire, ajouter un séparateur de date
        if (showDateSeparator) {
          messageGroups.push(
            <Box 
              key={`date-${message.id}`} 
              sx={{ 
                display: 'flex', 
                justifyContent: 'center', 
                mb: 3, 
                mt: index > 0 ? 3 : 1,
                position: 'relative'
              }}
            >
              <Chip
                label={formatMessageDate(message.created_at)}
                size="small"
                sx={{ 
                  backgroundColor: theme.palette.background.paper,
                  color: theme.palette.text.secondary,
                  fontWeight: 500,
                  boxShadow: theme.shadows[1],
                  zIndex: 1
                }}
              />
            </Box>
          );
        }
        
        // Ajouter le message actuel au groupe
        const isInbound = message.direction === 'inbound';
        
        messageGroups.push(
          <Box 
            key={message.id} 
            sx={{
              display: 'flex',
              justifyContent: isInbound ? 'flex-start' : 'flex-end',
              mb: 1
            }}
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: isInbound ? 'row' : 'row-reverse',
                alignItems: 'flex-end',
                maxWidth: '75%',
                width: '100%'
              }}
            >
              {isInbound && (
                <Avatar 
                  sx={{ 
                    width: 32, 
                    height: 32, 
                    ml: isInbound ? 0 : 1,
                    mr: isInbound ? 1 : 0,
                    bgcolor: theme.palette.primary.light
                  }}
                >
                  G
                </Avatar>
              )}

              <Tooltip 
                title={format(new Date(message.created_at), 'HH:mm')}
                placement={isInbound ? 'right' : 'left'}
                arrow
              >
                <Badge 
                  invisible={!(message as MessageWithEmergency).isEmergency}
                  badgeContent={
                    (message as MessageWithEmergency).unknownResponse ? 
                      <HelpOutlineIcon color="warning" fontSize="small" /> :
                      (message as MessageWithEmergency).emergencyType === 'Client mécontent' ?
                        <PriorityHighIcon color="error" fontSize="small" /> :
                        (message as MessageWithEmergency).emergencyType === 'Problème avec le logement' ?
                          <WarningIcon color="warning" fontSize="small" /> :
                          <ErrorOutlineIcon color="error" fontSize="small" />
                  }
                  overlap="circular"
                  anchorOrigin={{
                    vertical: 'top',
                    horizontal: isInbound ? 'right' : 'left',
                  }}
                  sx={{ 
                    width: '100%',
                    maxWidth: '100%',
                    display: 'flex',
                    '& .MuiBadge-badge': {
                      backgroundColor: (message as MessageWithEmergency).unknownResponse ? 
                        theme.palette.warning.light : 
                        ((message as MessageWithEmergency).emergencyType === 'Client mécontent' || 
                         (message as MessageWithEmergency).emergencyType?.includes('Urgence')) ? 
                        theme.palette.error.light : 
                        theme.palette.warning.light,
                      padding: '6px',
                      borderRadius: '50%',
                    }
                  }}
                >
                  <Paper
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      maxWidth: '100%',
                      width: 'auto',
                      minWidth: '50px',
                      backgroundColor: isInbound 
                        ? theme.palette.background.paper
                        : theme.palette.primary.main,
                      color: isInbound
                        ? theme.palette.text.primary
                        : theme.palette.primary.contrastText,
                      wordBreak: 'break-word',
                      boxShadow: theme.shadows[1],
                      opacity: loading ? 0.7 : 1,
                      transform: `translateY(${loading ? '10px' : '0'})`,
                      transition: 'opacity 0.3s ease, transform 0.3s ease',
                      overflowX: 'hidden'
                    }}
                  >
                    <Typography variant="body1" sx={{ 
                      whiteSpace: 'pre-line !important',
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      maxWidth: '100%',
                      width: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: 'block'
                    }}>
                      {message.content}
                    </Typography>
                  </Paper>
                </Badge>
              </Tooltip>
            </Box>
          </Box>
        );
        
        return messageGroups;
      }, []);
    } catch (error) {
      console.error(`${DEBUG_PREFIX} Erreur dans createMessageGroups:`, error);
      return [];
    }
  };
  
  // Générer les groupes de messages
  const messageElements = createMessageGroups();

  return (
    <Box>
      {messages.length === 0 ? (
        // Affichage d'un message lorsqu'il n'y a pas de conversations
        <Box sx={{ 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center', 
          justifyContent: 'center',
          height: '100%',
          p: 3,
          my: 4
        }}>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
            Aucun message
          </Typography>
          <Typography variant="body2" color="text.secondary" align="center">
            Envoyez un message pour démarrer la conversation
          </Typography>
        </Box>
      ) : (
        // Affichage des messages
        <Box sx={{ width: '100%' }}>
          {/* Debug info pour visualiser les problèmes */}
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, mb: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {`${messages.length} messages chargés`}
            </Typography>
          </Box>
          
          {/* Afficher les éléments de message */}
          {messageElements.length > 0 ? (
            messageElements
          ) : (
            // Afficher un message de débogage si les éléments ne sont pas générés alors que des messages existent
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="error">
                Problème d'affichage - {messages.length} messages en mémoire
              </Typography>
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={20} />
              </Box>
            </Box>
          )}
          
          <div ref={messagesEndRef} />
        </Box>
      )}
    </Box>
  );
}
