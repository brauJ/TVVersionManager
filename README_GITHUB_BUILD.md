# Compilar el APK con GitHub Actions

1. Crea un repositorio en https://github.com/new (por ejemplo `TVVersionManager`).
2. Descomprime este ZIP y sube **el contenido de la carpeta `TVVersionManager`**, no el ZIP como un solo archivo. Deben quedar `app/`, `build.gradle.kts`, `settings.gradle.kts` y `.github/workflows/android-apk.yml` en la raíz del repositorio.
3. Espera a que termine el workflow `Build TV Version Manager APK`, o entra a **Actions**, selecciona el workflow y pulsa **Run workflow**.
4. Si el trabajo termina en verde, abre la ejecución y descarga el artifact `TVVersionManager-debug-apk`. Dentro estará `app-debug.apk`.

Este workflow intenta compilar y ejecutar las pruebas unitarias. Si falla, abre el trabajo y copia el primer error de Gradle para diagnosticarlo. La compilación por sí sola no demuestra que la app pueda instalar/actualizar correctamente XUPER/MAGIS en el dispositivo: hace falta probarla en Android.
