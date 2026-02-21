import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('\x1b[36m%s\x1b[0m', '🔧 [AUTO-FIX] Verificando integridade dos plugins...');

// PATCH: @capacitor/push-notifications com Gradle 8+
const pushGradlePath = path.join(rootDir, 'node_modules/@capacitor/push-notifications/android/build.gradle');

if (fs.existsSync(pushGradlePath)) {
    try {
        let content = fs.readFileSync(pushGradlePath, 'utf8');
        if (content.includes("getDefaultProguardFile('proguard-android.txt')")) {
            console.log('\x1b[33m➤ Aplicando patch no @capacitor/push-notifications (Gradle 8+ Support)...\x1b[0m');
            content = content.replace(
                "getDefaultProguardFile('proguard-android.txt')",
                "getDefaultProguardFile('proguard-android-optimize.txt')"
            );
            fs.writeFileSync(pushGradlePath, content);
            console.log('\x1b[32m✅ Plugin corrigido com sucesso!\x1b[0m');
        } else {
            console.log('\x1b[90mℹ️ Plugin @capacitor/push-notifications já está atualizado.\x1b[0m');
        }
    } catch (e) {
        console.error('\x1b[31m❌ Erro ao aplicar patch:\x1b[0m', e.message);
    }
} else {
    console.log('\x1b[90mℹ️ Plugin @capacitor/push-notifications não instalado.\x1b[0m');
}