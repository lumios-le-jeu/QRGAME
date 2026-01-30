#!/bin/bash

# Script de lancement facile pour Mac/Linux
echo "=========================================="
echo "   LANCEMENT DE QRSHOT (MAC MINI)"
echo "=========================================="

# Tuer les anciens processus si ils trainent
pkill -f "node server.js"
pkill -f "cloudflared"

# 1. Lancer le serveur
echo "🚀 Démarrage du serveur Node.js..."
node server.js > server.log 2>&1 &
SERVER_PID=$!
echo "   - Serveur lancé (PID: $SERVER_PID)"

sleep 2

# 2. Lancer le tunnel
echo "🚇 Ouverture du Tunnel Cloudflare..."
cloudflared tunnel run --token eyJhIjoiMjI3MzU3MTZhN2YzMDQ3ZGI5OGRkNWM2MzdhYzM0M2UiLCJ0IjoiY2E2MWYzYjgtMmY5YS00NjljLWIyN2ItOTYxMDE0NDQzYjc5IiwicyI6Ik1tRmxOalJqTWpJdFpXSTFaQzAwTnpKakxXSTVaV0V0T1RVek56ZzVaV05qWkdRMiJ9 > tunnel.log 2>&1 &
TUNNEL_PID=$!
echo "   - Tunnel lancé (PID: $TUNNEL_PID)"

echo ""
echo "✅ TOUT EST OPÉRATIONNEL !"
echo "🌐 URL : https://fun.qrshotgame.fr/"
echo ""
echo "Appuie sur une touche pour arrêter le serveur..."
read -n 1 -s -r -p ""

# Nettoyage à la sortie
echo ""
echo "🛑 Arrêt des services..."
kill $SERVER_PID
kill $TUNNEL_PID
echo "👋 Bye bye !"
