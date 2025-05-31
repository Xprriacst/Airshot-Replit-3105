/**
 * Fonction Netlify pour analyser une conversation et détecter les cas d'urgence
 * Ce fichier redirige vers la version modulaire pour une meilleure maintenabilité
 */

// Importer le handler de la version modulaire
const { handler } = require('./analyze-emergency/index');

// Exporter le handler
exports.handler = handler;
