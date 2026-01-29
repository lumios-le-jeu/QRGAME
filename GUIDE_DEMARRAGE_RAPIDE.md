# 🚀 GUIDE DE DÉMARRAGE RAPIDE (LOCAL + NGROK)

Voici comment relancer votre jeu **QRSHOT** à tout moment depuis votre ordinateur.

## ÉTAPE 1 : Lancer le Serveur du Jeu (Cerveau) 🧠

1.  Ouvrez le dossier du projet : `c:\Users\nak1oeil\Documents\ANTIGRAVITY\QRGAME\qrshot-node`
2.  Dans la barre d'adresse du dossier (en haut), tapez `cmd` et faites **Entrée**. Une fenêtre noire s'ouvre.
3.  Tapez la commande suivante et validez :
    ```bash
    node server.js
    ```
4.  Vous devriez voir : `Server running on http://localhost:3000`.
    ⚠️ **LAISSEZ CETTE FENÊTRE OUVERTE !** (Si vous la fermez, le jeu s'arrête).

---

## ÉTAPE 2 : Mettre en Ligne avec Ngrok (Tunnel) 🌍

1.  Lancez le logiciel **ngrok.exe** (celui que vous avez téléchargé). Une *autre* fenêtre noire s'ouvre.
2.  Tapez la commande suivante et validez :
    ```bash
    ngrok http 3000
    ```
3.  Ngrok va afficher un tableau "Session Status: online".
4.  Cherchez la ligne **Forwarding**. Copiez l'adresse qui commence par `https://...`
    *   *Exemple :* `https://a1b2-c3d4.ngrok-free.app`

---

## ÉTAPE 3 : JOUER ! 🔫

1.  **Sur votre PC** : Ouvrez ce lien `https://...` dans votre navigateur pour **Créer la Partie** (Admin).
2.  **Sur les Mobiles** : 
    *   Envoyez ce même lien à vos amis (SMS, WhatsApp, QR Code...).
    *   Ils doivent l'ouvrir, accepter la **Géolocalisation** et la **Caméra**.
    *   Ils cliquent sur "REJOINDRE".

---

### 💡 Astuces
*   **Si le lien ne marche plus** : Vérifiez que les 2 fenêtres noires (Node et Ngrok) sont toujours ouvertes.
*   **Si vous relancez Ngrok** : Le lien change à chaque fois ! Il faut redonner le nouveau lien aux joueurs.
