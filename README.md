# TV Version Manager

Proyecto base Android Studio en Kotlin + Jetpack Compose. Objetivo configurado en `PackageRepository.kt`.

## Seguridad importante

- La URL HTTPS y el nombre del archivo no demuestran que el APK sea auténtico.
- El código verifica paquete y `versionName`; si la app objetivo ya está instalada, exige que los certificados de firma del APK coincidan con los de la instalación.
- Para instalaciones nuevas, el proyecto rechaza el APK si no se configura `EXPECTED_SHA256` con una huella obtenida por un canal confiable. No se incluye una huella inventada.
- No se desinstala automáticamente ninguna aplicación.
- La descarga usa almacenamiento privado y no requiere permiso de almacenamiento general.

## Completar configuración del proveedor FileProvider

Añade dentro de `<application>` en `app/src/main/AndroidManifest.xml`:

```xml
<provider
    android:name="androidx.core.content.FileProvider"
    android:authorities="${applicationId}.provider"
    android:exported="false"
    android:grantUriPermissions="true">
    <meta-data
        android:name="android.support.FILE_PROVIDER_PATHS"
        android:resource="@xml/file_paths" />
</provider>
```

## Compilar

1. Abre la carpeta `TVVersionManager` en Android Studio.
2. Usa JDK 17 y permite que Gradle sincronice.
3. Ejecuta las pruebas con `./gradlew test`.
4. Genera APK debug con `./gradlew assembleDebug`.
5. El APK se genera en `app/build/outputs/apk/debug/app-debug.apk`.

## Limitaciones de Android

- Un APK de actualización debe tener el mismo `applicationId` y una firma compatible; una firma distinta no puede actualizar la instalación existente.
- El instalador estándar normalmente impide bajar `versionCode`. `versionName` no determina el orden de instalación.
- Para degradar puede ser necesario desinstalar primero; esto puede borrar los datos de la app. El usuario debe hacerlo manualmente en Ajustes, después de comprobar el APK.
- La instalación requiere confirmación del usuario en dispositivos normales.
- Este proyecto valida la versión de `versionName`, pero no puede saber que el servidor no cambiará el archivo más adelante sin una huella fijada o firma de distribución fiable.
- Si `versionName` no sigue un formato numérico `x.y.z`, el estado se muestra como desconocido.

## Comprobación del APK de origen

Antes de distribuir:
1. Descarga el APK desde la URL en un entorno de análisis controlado.
2. Inspecciona el paquete con `apkanalyzer manifest application-id update.apk`.
3. Comprueba la versión con `apkanalyzer manifest version-name update.apk` y `apkanalyzer manifest version-code update.apk`.
4. Inspecciona certificados con `apksigner verify --print-certs update.apk`.
5. Compara el certificado con el desarrollador/proveedor por un canal independiente.
6. Calcula SHA-256 (`sha256sum update.apk` o `Get-FileHash update.apk -Algorithm SHA256`) y configura la huella en el código solo si se obtuvo de una fuente fiable.
7. Prueba una actualización en un dispositivo de prueba con datos prescindibles.

No se ha afirmado que `https://yoveo.tv/update.apk` contenga realmente la versión objetivo; la app lo comprueba en tiempo de ejecución.
