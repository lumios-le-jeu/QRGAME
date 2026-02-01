import cv2
import numpy as np

# Load AprilTag 36h11 Dictionary
aruco_dict = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_APRILTAG_36h11)

print("var APRILTAG_36H11 = {")
# We only use IDs 0-100 (Players) and 200-255 (Zones) and 580 (Admin).
# Let's map ALL needed IDs.
needed_ids = list(range(0, 101)) + list(range(200, 256)) + [580]

for id in needed_ids:
    # bits is a 6x6 numpy array?
    # bytesList contains the marker codification.
    # For AprilTag it is 36h11. 36 bits.
    # verify format
    
    # Actually bytesList is (N, 4, 4)? Or (N, M)?
    # For 36h11, it is (N, 5, 1) bytes? or just bits packed?
    pass

# Simplified: Generate the image for each ID and read the bits back!
# This ensures we match exactly what we print.

codes = {}

for id in needed_ids:
    if id >= len(aruco_dict.bytesList): continue
    
    img = cv2.aruco.generateImageMarker(aruco_dict, id, 6) # 6x6 pixels
    # This gives the inner 6x6 bits.
    # Flatten it to a binary string or integer.
    
    # img is uint8 (0 or 255).
    # flatten
    bits = (img > 128).astype(int).flatten()
    
    # Convert to 36-bit integer
    val = 0
    for b in bits:
        val = (val << 1) | b
        
    print(f"  {val}: {id},") # Map CODE -> ID

print("};")
