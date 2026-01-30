# Guide Cloudflare Tunnel

Cloudflare Tunnel est une excellente alternative à Ngrok. Il permet d'exposer votre serveur local (localhost:3000) sur internet de manière sécurisée sans ouvrir de ports sur votre routeur.

## 1. Installation

### Sur Windows (Machine actuelle)
Ouvrez PowerShell et exécutez :
```powershell
winget install Cloudflare.cloudflared
```
*Note : Vous devrez peut-être redémarrer votre terminal après l'installation.*

### Sur Mac Mini (Serveur)
Ouvrez le terminal et utilisez Homebrew :
```bash
brew install cloudflared
```

## 2. Test Rapide (Comme Ngrok)
Pour tester immédiatement sans créer de compte (URL temporaire aléatoire) :

**Commande :**
```bash
cloudflared tunnel --url http://localhost:3000
```
Cela vous donnera une URL du type `https://votre-tunnel.trycloudflare.com`.

## 3. Tunnel Persistent (Recommandé pour la Prod)
Si vous voulez un domaine fixe (ex: `game.mondomaine.com`), vous devez avoir un compte Cloudflare et un nom de domaine.

1. Connectez-vous :
   ```bash
   cloudflared tunnel login
   ```
2. Créez un tunnel :
   ```bash
   cloudflared tunnel create qrgame
   ```
3. Configurez le routage DNS (dans le dashboard Cloudflare ou via CLI) pour pointer vers ce tunnel.
4. Lancez le tunnel :
   ```bash
   cloudflared tunnel run qrgame
   ```
