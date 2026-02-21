import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const libs = [
    { name: 'cropper.min.js', url: 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js' },
    { name: 'cropper.min.css', url: 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css' },
    { name: 'supabase.min.js', url: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2' },
    { name: 'pixi.min.js', url: 'https://cdnjs.cloudflare.com/ajax/libs/pixi.js/7.3.2/pixi.min.js' },
    { name: 'gsap.min.js', url: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js' },
    { name: 'mapbox-gl.js', url: 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js' },
    { name: 'mapbox-gl.css', url: 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css' }
];

const dirs = [
    path.join(__dirname, 'www', 'libs'),
    path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'public', 'libs')
];

dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Diretório criado: ${dir}`);
    }
});

const download = (url, dest) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, response => {
            if (response.statusCode !== 200) {
                reject(new Error(`Falha ao baixar ${url}: Status ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', err => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
};

async function install() {
    console.log('Iniciando download das bibliotecas de fallback...');
    
    for (const lib of libs) {
        console.log(`Baixando ${lib.name}...`);
        const primaryPath = path.join(dirs[0], lib.name);
        await download(lib.url, primaryPath);
        
        for (let i = 1; i < dirs.length; i++) {
            fs.copyFileSync(primaryPath, path.join(dirs[i], lib.name));
        }
    }
    console.log('✅ Todas as bibliotecas foram instaladas com sucesso!');
}

install();