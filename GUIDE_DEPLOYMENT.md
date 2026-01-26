# DÉPLOIEMENT SUR HOSTINGER (Node.js)

Puisque vous avez un hébergement Hostinger (lumios-qc.com), voici comment mettre en ligne votre jeu **QRSHOT**.

## PRÉ-REQUIS HOSTINGER
1. Connectez-vous à votre **hPanel** (comme sur votre capture d'écran).
2. Regardez dans le menu de gauche ou la barre de recherche:
   - Cherchez **"Node.js"** ou **"Setup Node.js App"**.
   - *Note : Si vous ne trouvez pas cette option, votre plan (souvent le "Web Hosting" basique) ne supporte peut-être pas Node.js, mais seulement PHP. Dans ce cas, contactez le support ou utilisez la méthode "NGROK" ci-dessous.*

---

## METHODE 1 : Si vous avez l'option "Node.js"

1. **Créer l'application** :
   - Cliquez sur **Setup Node.js App**.
   - Version Node.js : Choisissez la plus récente recommandée (18.x ou 20.x).
   - Mode : **Production**.
   - Application Root : `qrshot` (cela créera un dossier).
   - Application URL : `lumios-qc.com/qrshot` (ou un sous-domaine `jeu.lumios-qc.com`).
   - Application Startup File : `server.js`.
   - Cliquez sur **Create**.

2. **Téléverser les fichiers** :
   - Allez dans le **Gestionnaire de fichiers** (Files Manager).
   - Naviguez dans le dossier `qrshot` nouvellement créé.
   - Téléversez TOUS vos fichiers locaux (sauf `node_modules`).
     - `server.js`
     - `package.json`
     - Dossier `public/`
   - *Astuce : Zippez tout votre dossier local, uploadez le ZIP, et décompressez-le via le gestionnaire de fichiers.*

3. **Installer les dépendances** :
   - Retournez dans le menu **Node.js App**.
   - Cliquez sur le bouton **"NPM Install"** (cela va lire votre `package.json` et installer `socket.io`, `express`, etc.).

4. **Lancer** :
   - Cliquez sur **Restart** (Redémarrer).
   - Accédez à votre URL (ex: `lumios-qc.com/qrshot`). Le jeu devrait charger !
   - *Important* : Le GPS et la Caméra nécessitent impérativement **HTTPS** (le cadenas 🔒). Hostinger active souvent SSL par défaut, vérifiez que vous êtes bien en `https://`.

---

## METHODE 2 : "NGROK" (Le plus simple pour tester tout de suite)

Si votre Hostinger ne supporte pas Node.js ou si c'est trop compliqué pour l'instant, utilisez **ngrok** sur votre PC. Cela crée un tunnel temporaire vers votre PC.

1. Téléchargez **ngrok** (gratuit) sur [ngrok.com](https://ngrok.com).
2. Ouvrez un terminal sur votre PC.
3. Lancez votre serveur jeu : `node server.js`
4. Lancez ngrok sur le port 3000 : `ngrok http 3000`
5. Copiez l'URL HTTPS fournie (ex: `https://a1b2-c3d4.ngrok-free.app`).
6. Envoyez ce lien à vos amis. Ils pourront jouer depuis leur téléphone comme si c'était hébergé !
