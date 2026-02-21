import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('🔍 [PRE-BUILD] Iniciando validação de integridade offline...');

let hasError = false;

// 1. Verificar node_modules
if (!fs.existsSync(path.join(rootDir, 'node_modules'))) {
    console.error('❌ [FAIL] node_modules não encontrado. Execute "npm install".');
    hasError = true;
}

// 2. Verificar Supabase Local
if (!fs.existsSync(path.join(rootDir, 'node_modules/@supabase/supabase-js'))) {
    console.error('❌ [FAIL] @supabase/supabase-js não instalado localmente.');
    hasError = true;
}

// 3. Verificar google-services.json (Android)
if (!fs.existsSync(path.join(rootDir, 'android/app/google-services.json'))) {
    console.warn('⚠️ [WARN] google-services.json não encontrado em android/app/. Push Notifications não funcionarão.');
    // hasError = true; // Downgraded to warning
}

// 4. Verificar CDNs em HTML (Proibido em Runtime)
const htmlFiles = [
    path.join(rootDir, 'www/index.html'),
    path.join(rootDir, 'www/app.html'),
    path.join(rootDir, 'www/onboard.html')
];

htmlFiles.forEach(file => {
    if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf-8');
        
        // Regex para detectar scripts externos (exceto localhost para dev)
        const scriptCdnRegex = /<script\s+[^>]*src=["'](https?:\/\/(?!localhost|127\.0\.0\.1)[^"']+)["']/gi;
        const linkCdnRegex = /<link\s+[^>]*href=["'](https?:\/\/(?!localhost|127\.0\.0\.1)[^"']+)["']/gi;

        let match;
        while ((match = scriptCdnRegex.exec(content)) !== null) {
            console.error(`❌ [FAIL] CDN Detectado em ${path.basename(file)}: ${match[1]}`);
            hasError = true;
        }
        while ((match = linkCdnRegex.exec(content)) !== null) {
            console.error(`❌ [FAIL] CSS CDN Detectado em ${path.basename(file)}: ${match[1]}`);
            hasError = true;
        }
    }
});

if (hasError) {
    console.error('🚨 [ABORT] Validação falhou. O build não pode prosseguir.');
    process.exit(1);
}

console.log('✅ [SUCCESS] Validação concluída. Ambiente seguro para build offline.');