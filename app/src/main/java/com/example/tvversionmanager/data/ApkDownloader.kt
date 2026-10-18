package com.example.tvversionmanager.data

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.StatFs
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlin.coroutines.coroutineContext

data class DownloadedApk(
    val file: File,
    val sha256: String,
    val size: Long
)

class ApkDownloader(private val context: Context) {

    suspend fun download(
        onProgress: (percent: Int?, bytes: Long) -> Unit
    ): DownloadedApk = withContext(Dispatchers.IO) {

        val url = URL(PackageRepository.APK_URL)
        require(url.protocol == "https") {
            "La URL no usa HTTPS."
        }

        val connection = (url.openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 30_000
            instanceFollowRedirects = true
            requestMethod = "GET"
        }

        val file = File(context.cacheDir, "target-update.apk")

        try {
            connection.connect()

            val code = connection.responseCode
            require(code in 200..299) {
                "El servidor respondió HTTP $code."
            }

            val expectedLength = connection.contentLengthLong
            val available = StatFs(context.cacheDir.absolutePath).availableBytes

            if (expectedLength > 0 && expectedLength > available) {
                throw IllegalStateException(
                    "No hay espacio suficiente para descargar el APK."
                )
            }

            val digest = MessageDigest.getInstance("SHA-256")
            var total = 0L

            connection.inputStream.use { input ->
                FileOutputStream(file).use { output ->
                    val buffer = ByteArray(64 * 1024)

                    while (true) {
                        coroutineContext.ensureActive()

                        val read = input.read(buffer)
                        if (read < 0) break

                        output.write(buffer, 0, read)
                        digest.update(buffer, 0, read)
                        total += read

                        val percent = if (expectedLength > 0) {
                            ((total * 100) / expectedLength)
                                .toInt()
                                .coerceIn(0, 100)
                        } else {
                            null
                        }

                        onProgress(percent, total)
                    }

                    output.fd.sync()
                }
            }

            require(file.length() > 0) {
                "El archivo descargado está vacío."
            }

            val hash = digest.digest().joinToString("") {
                "%02x".format(it)
            }

            // Si se configuró una huella esperada, comprobarla.
            // Si es null, continuar sin esa comprobación.
            PackageRepository.EXPECTED_SHA256?.let { expected ->
                require(hash.equals(expected, ignoreCase = true)) {
                    "La huella SHA-256 no coincide."
                }
            }

            DownloadedApk(file, hash, total)

        } catch (e: Throwable) {
            file.delete()
            throw e
        } finally {
            connection.disconnect()
        }
    }

    fun validate(file: File): String {
        require(file.isFile && file.length() > 0) {
            "El archivo APK no es válido."
        }

        val pm = context.packageManager

        val info = if (Build.VERSION.SDK_INT >= 33) {
            pm.getPackageArchiveInfo(
                file.absolutePath,
                PackageManager.PackageInfoFlags.of(
                    PackageManager.GET_SIGNING_CERTIFICATES.toLong()
                )
            )
        } else {
            @Suppress("DEPRECATION")
            pm.getPackageArchiveInfo(
                file.absolutePath,
                PackageManager.GET_SIGNING_CERTIFICATES
            )
        } ?: throw IllegalArgumentException(
            "El archivo no se reconoce como un APK válido."
        )

        require(info.packageName == PackageRepository.TARGET_PACKAGE) {
            "Paquete inesperado: ${info.packageName}. " +
                "Se esperaba ${PackageRepository.TARGET_PACKAGE}."
        }

        require(info.versionName == PackageRepository.TARGET_VERSION) {
            "Versión inesperada: ${info.versionName ?: "desconocida"}. " +
                "Se esperaba ${PackageRepository.TARGET_VERSION}."
        }

        val installedInfo = try {
            if (Build.VERSION.SDK_INT >= 33) {
                pm.getPackageInfo(
                    PackageRepository.TARGET_PACKAGE,
                    PackageManager.PackageInfoFlags.of(
                        PackageManager.GET_SIGNING_CERTIFICATES.toLong()
                    )
                )
            } else {
                @Suppress("DEPRECATION")
                pm.getPackageInfo(
                    PackageRepository.TARGET_PACKAGE,
                    PackageManager.GET_SIGNING_CERTIFICATES
                )
            }
        } catch (_: PackageManager.NameNotFoundException) {
            null
        }

        if (installedInfo != null) {
            val archiveSigners = info.signingInfo
                ?.apkContentsSigners
                ?.map { it.toCharsString() }
                ?.toSet()
                .orEmpty()

            val installedSigners = installedInfo.signingInfo
                ?.apkContentsSigners
                ?.map { it.toCharsString() }
                ?.toSet()
                .orEmpty()

            require(
                archiveSigners.isNotEmpty() &&
                    installedSigners.isNotEmpty() &&
                    archiveSigners == installedSigners
            ) {
                "La firma del APK no coincide con la aplicación instalada. " +
                    "Se rechazó el archivo."
            }
        }

        // Para instalaciones nuevas se permite continuar sin SHA-256.
        // Android seguirá aplicando sus propias reglas de instalación y firma.
        return if (PackageRepository.EXPECTED_SHA256 == null) {
            "APK válido: paquete y versión coinciden. " +
                "No se verificó la procedencia mediante SHA-256."
        } else {
            "APK válido: paquete, versión y SHA-256 comprobados."
        }
    }
}
