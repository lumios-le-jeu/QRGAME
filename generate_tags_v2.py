import cv2
import cv2.aruco as aruco
import numpy as np
import os

# DICT_ARUCO_ORIGINAL est un format 5x5 bits, correspondant exactement à la lib JS (7x7 avec bordure)
DICT_TYPE = aruco.DICT_ARUCO_ORIGINAL 
MARKER_SIZE = 400
QUIET_ZONE = 100 
OUTPUT_DIR = "tags_v2_compat"

aruco_dict = aruco.getPredefinedDictionary(DICT_TYPE)
if not os.path.exists(OUTPUT_DIR): os.makedirs(OUTPUT_DIR)

def make_tag(id, label, color, folder):
    # Création du marqueur
    img = aruco.generateImageMarker(aruco_dict, id, MARKER_SIZE)
    img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    
    # Création d'un canevas blanc avec une large marge
    h, w = img.shape[:2]
    canvas_w = w + (QUIET_ZONE * 2)
    canvas_h = h + (QUIET_ZONE * 2) + 80 
    canvas = np.ones((canvas_h, canvas_w, 3), dtype="uint8") * 255
    
    # Placement du marqueur
    canvas[QUIET_ZONE:QUIET_ZONE+h, QUIET_ZONE:QUIET_ZONE+w] = img
    
    # Ajout du texte
    font = cv2.FONT_HERSHEY_DUPLEX
    text = f"ID: {id} - {label}"
    text_size = cv2.getTextSize(text, font, 1.2, 2)[0]
    text_x = (canvas_w - text_size[0]) // 2
    cv2.putText(canvas, text, (text_x, canvas_h - 30), font, 1.2, color, 2, cv2.LINE_AA)
    
    # Sauvegarde
    path = os.path.join(OUTPUT_DIR, folder)
    if not os.path.exists(path): os.makedirs(path)
    cv2.imwrite(os.path.join(path, f"tag_{id}.png"), canvas)

# --- GÉNÉRATION ---
print("Génération de la série complète (Original ArUco)...")

# 1. MISC
make_tag(0, "RELOAD", (0, 0, 0), "misc")
make_tag(256, "ADMIN", (0, 150, 0), "misc")

# 2. RED TEAM (1-49)
print("Génération RED TEAM (1-49)...")
for i in range(1, 50):
    make_tag(i, "RED TEAM", (0, 0, 255), "red")

# 3. BLUE TEAM (50-100)
print("Génération BLUE TEAM (50-100)...")
for i in range(50, 101):
    make_tag(i, "BLUE TEAM", (255, 0, 0), "blue")

# 4. STRATEGIC ZONES (200-250)
print("Génération STRATEGIC ZONES (200-250)...")
for i in range(200, 251):
    make_tag(i, "STRATEGIC ZONE", (0, 165, 255), "zones") # Orange/Ambre

print(f"\nTERMINÉ ! {len(os.listdir(os.path.join(OUTPUT_DIR, 'red'))) + len(os.listdir(os.path.join(OUTPUT_DIR, 'blue'))) + len(os.listdir(os.path.join(OUTPUT_DIR, 'misc'))) + len(os.listdir(os.path.join(OUTPUT_DIR, 'zones')))} tags générés dans : {OUTPUT_DIR}")
