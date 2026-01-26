const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, 'public', 'qrcodes');

// Targets to generate
const targets = [
    { id: 'PLAYER_RED_1', label: 'Joueur Rouge 1', color: '#ff3333' },
    { id: 'PLAYER_RED_2', label: 'Joueur Rouge 2', color: '#ff3333' },
    { id: 'PLAYER_BLUE_1', label: 'Joueur Bleu 1', color: '#3388ff' },
    { id: 'PLAYER_BLUE_2', label: 'Joueur Bleu 2', color: '#3388ff' },
    { id: 'ADMIN_ACCESS', label: 'Admin Access', color: '#00f3ff' },
    { id: 'BASE_A', label: 'Base A', color: '#ffffff' },
    { id: 'RELOAD', label: 'RELOAD WEAPON', color: '#00ff00' }
];

async function generate() {
    console.log("Generating QR Codes...");

    let htmlContent = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <title>Test QR Codes</title>
        <style>
            body { font-family: sans-serif; background: #111; color: white; display: flex; flex-wrap: wrap; justify-content: center; gap: 20px; padding: 20px; }
            .card { background: #222; padding: 20px; border-radius: 10px; text-align: center; border: 2px solid #333; width: 250px; }
            img { border: 10px solid white; border-radius: 4px; }
            h3 { margin-bottom: 5px; }
            p { color: #888; font-size: 0.9em; font-family: monospace; }
        </style>
    </head>
    <body>
    `;

    for (const target of targets) {
        const filename = `${target.id}.png`;
        const filepath = path.join(outputDir, filename);

        await QRCode.toFile(filepath, target.id, {
            color: {
                dark: '#000000',
                light: '#ffffff'
            },
            width: 300
        });

        console.log(`Created ${filename}`);

        htmlContent += `
        <div class="card" style="border-color: ${target.color}">
            <h3 style="color: ${target.color}">${target.label}</h3>
            <img src="qrcodes/${filename}" width="200">
            <p>${target.id}</p>
        </div>`;
    }

    htmlContent += `</body></html>`;

    fs.writeFileSync(path.join(__dirname, 'public', 'test_qrcodes.html'), htmlContent);
    console.log("Index page created at public/test_qrcodes.html");
}

generate();
