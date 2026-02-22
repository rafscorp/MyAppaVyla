import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('\x1b[36m%s\x1b[0m', '📱 [AUTO-BUILD] Iniciando pipeline de build mobile...');

const runStep = (command, description) => {
    console.log(`\n\x1b[33m➤ ${description}...\x1b[0m`);
    try {
        // stdio: 'inherit' mantém as cores e logs do comando original
        execSync(command, { stdio: 'inherit', cwd: rootDir });
    } catch (error) {
        console.error(`\n\x1b[31m❌ Erro fatal na etapa: ${description}\x1b[0m`);
        process.exit(1);
    }
};

// 0. Verificação de Segurança: google-services.json
const googleServicesPath = path.join(rootDir, 'android', 'app', 'google-services.json');
if (fs.existsSync(googleServicesPath)) {
    console.log('\x1b[32m✅ [CHECK] google-services.json detectado em android/app/\x1b[0m');

    // 0.1 Verificação de Consistência de ID (App ID vs Package Name)
    try {
        const configUrl = pathToFileURL(path.join(rootDir, 'capacitor.config.js')).href;
        const capacitorConfig = (await import(configUrl)).default;
        const appId = capacitorConfig.appId;

        const googleServices = JSON.parse(fs.readFileSync(googleServicesPath, 'utf8'));
        const hasMatch = googleServices.client.some(c => 
            c.client_info?.android_client_info?.package_name === appId
        );

        if (hasMatch) {
            console.log(`\x1b[32m✅ [CHECK] ID do App confirmado: ${appId}\x1b[0m`);
        } else {
            const found = googleServices.client.map(c => c.client_info?.android_client_info?.package_name).filter(Boolean).join(', ');
            console.warn(`\x1b[31m❌ [FAIL] Mismatch de ID! "capacitor.config.js" (${appId}) não bate com "google-services.json" (${found}).\x1b[0m`);
        }
    } catch (e) {
        console.warn(`\x1b[33m⚠️ [WARN] Não foi possível validar IDs: ${e.message}\x1b[0m`);
    }
} else {
    console.warn('\x1b[33m⚠️ [WARN] google-services.json AUSENTE em android/app/. O build pode falhar ou o Firebase não funcionará.\x1b[0m');
}

// 1. Validação de Integridade (usa o script existente)
runStep('node scripts/validate-build.js', 'Validando ambiente e dependências');

// 2. Build Web Otimizado (Vite)
// O Vite vai ler o vite.config.js que configuramos para remover/injetar o cordova.js
runStep('npm run build', 'Gerando bundle de produção (Vite)');

// PATCH: Correção automática para @capacitor/push-notifications com Gradle 8+
const pushPluginGradle = path.join(rootDir, 'node_modules/@capacitor/push-notifications/android/build.gradle');
if (fs.existsSync(pushPluginGradle)) {
    console.log('\n\x1b[33m➤ Aplicando patch no plugin Push Notifications...\x1b[0m');
    try {
        let gradleContent = fs.readFileSync(pushPluginGradle, 'utf8');
        if (gradleContent.includes('proguard-android.txt')) {
            gradleContent = gradleContent.replace('proguard-android.txt', 'proguard-android-optimize.txt');
            fs.writeFileSync(pushPluginGradle, gradleContent);
            console.log('\x1b[32m✅ Plugin corrigido para suportar R8/Gradle 8+\x1b[0m');
        } else {
            console.log('\x1b[90mℹ️ Plugin já estava corrigido.\x1b[0m');
        }
    } catch (e) {
        console.warn('\x1b[31m⚠️ Falha ao aplicar patch no plugin:\x1b[0m', e.message);
    }
}

// PATCH: Correção automática para @capacitor/haptics com Gradle 8+
const hapticsPluginGradle = path.join(rootDir, 'node_modules/@capacitor/haptics/android/build.gradle');
if (fs.existsSync(hapticsPluginGradle)) {
    console.log('\n\x1b[33m➤ Aplicando patch no plugin Haptics...\x1b[0m');
    try {
        let gradleContent = fs.readFileSync(hapticsPluginGradle, 'utf8');
        if (gradleContent.includes('proguard-android.txt')) {
            gradleContent = gradleContent.replace('proguard-android.txt', 'proguard-android-optimize.txt');
            fs.writeFileSync(hapticsPluginGradle, gradleContent);
            console.log('\x1b[32m✅ Plugin Haptics corrigido para suportar R8/Gradle 8+\x1b[0m');
        } else {
            console.log('\x1b[90mℹ️ Plugin Haptics já estava corrigido.\x1b[0m');
        }
    } catch (e) {
        console.warn('\x1b[31m⚠️ Falha ao aplicar patch no plugin Haptics:\x1b[0m', e.message);
    }
}

// 3. Sincronização Capacitor
// Copia a pasta 'dist' para dentro do projeto Android/iOS
runStep('npx cap sync', 'Sincronizando assets com projeto nativo');

console.log('\n\x1b[32m✅ Build Mobile concluído com sucesso!\x1b[0m');
console.log('\x1b[90m👉 Próximo passo: Execute "npx cap open android" para rodar no emulador.\x1b[0m');