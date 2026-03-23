# 🚀 GUIDE DE DÉPLOIEMENT (Windows & Mac Mini)

Ce guide t'explique comment lancer le servuer de jeu et le tunnel Cloudflare sur ton PC actuel ou ton futur Mac Mini.

---

## 🔑 TON TOKEN CLOUDFLARE (SECRET)
C'est la clé qui relie ton ordinateur à `fun.qrshotgame.fr`.  
**Token :** 
```text
eyJhIjoiMjI3MzU3MTZhN2YzMDQ3ZGI5OGRkNWM2MzdhYzM0M2UiLCJ0IjoiY2E2MWYzYjgtMmY5YS00NjljLWIyN2ItOTYxMDE0NDQzYjc5IiwicyI6Ik1tRmxOalJqTWpJdFpXSTFaQzAwTnpKakxXSTVaV0V0T1RVek56ZzVaV05qWkdRMiJ9
```

---

## 🖥️ OPTION 1 : Sur ton PC WINDOWS (Actuel)

J'ai créé un script automatique pour toi.

### Méthode "En un clic" :
1. J'ai créé un fichier `LANCER_JEU.bat` dans ce dossier.
2. Double-clique simplement dessus.
3. Une fenêtre noire va s'ouvrir et lancer :
   - Le serveur Node.js (Port 3000)
   - Le Tunnel Cloudflare
4. **Ne ferme pas cette fenêtre** tant que tu veux que le jeu soit accessible.

### Méthode Manuelle (Terminal) :
Ouvre PowerShell dans le dossier et lance :
```powershell
# 1. Lancer le serveur
Start-Process -NoNewWindow "node" "server.js"

# 2. Lancer le tunnel
cloudflared tunnel run --token <COPIER_LE_TOKEN_CI_DESSUS>
```

---

## 🍎 OPTION 2 : Sur le MAC MINI (Serveur Dédié)

Quand tu auras ton Mac, voici la procédure étape par étape.

### 1. Installation des outils
Ouvre le **Terminal** sur le Mac et installe Homebrew, Node et Cloudflared :

```bash
# 1. Installer Node.js (si pas déjà fait)
brew install node

# 2. Installer Cloudflared
brew install cloudflare/cloudflare/cloudflared
```

### 2. Récupérer le code
Copie tout le dossier `qrshot-node` sur le Mac (par clé USB ou Git).

### 3. Lancer le jeu (Mode Test)
Dans le terminal du Mac, va dans le dossier :
```bash
cd /chemin/vers/qrshot-node
npm install  # Juste la première fois
./start_mac.sh
```
*(J'ai créé le fichier `start_mac.sh` pour toi, n'oublie pas de le rendre exécutable avec `chmod +x start_mac.sh` avant :)*

### 4. Lancer en "Mode Serveur" (24h/24 sans fenêtre ouverte)
Pour que le Mac lance le jeu tout seul au démarrage :

**A. Pour le serveur Node (avec PM2) :**
```bash
sudo npm install -g pm2
pm2 start server.js --name "qrshot"
pm2 startup
pm2 save
```

**B. Pour le tunnel Cloudflare (Service) :**
```bash
sudo cloudflared service install <COPIER_LE_TOKEN_CI_DESSUS>
```

---

## 🔄 PROCÉDURE DE MISE À JOUR RAPIDE

Voici les étapes à suivre dès que je finis de coder une nouvelle fonctionnalité :

### Étape 1 : Envoyer le code (Sur Windows)
Dans le terminal VS Code de ton PC Windows :
```powershell
git add .
git commit -m "Description de ton changement"
git push origin main
```

### Étape 2 : Récupérer le code (Sur le Mac Mini via SSH)
Connecte-toi au Mac Mini, puis exécute ces 3 commandes :
```bash
# 1. Aller dans le bon dossier
cd /Users/etienneleborgne/QRGAME/qrshot-node

# 2. Télécharger les nouveautés depuis GitHub
git pull

# 3. Redémarrer le serveur pour appliquer les changements
pm2 restart qrshot-server
```

---

*Note : Si le `git pull` échoue à cause de modifications locales sur le Mac, tu peux forcer l'écrasement avec : `git reset --hard origin/main` (Attention, cela efface les changements non commités sur le Mac).*
