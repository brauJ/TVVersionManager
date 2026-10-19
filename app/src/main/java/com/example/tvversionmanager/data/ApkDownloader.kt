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
            "La URL no utiliza HTTPS."
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

            val responseCode = connection.responseCode
            require(responseCode in 200..299) {
                "El servidor respondió HTTP $responseCode."
            }

            val expectedLength = connection.contentLengthLong
            val availableBytes = StatFs(context.cacheDir.absolutePath).availableBytes

            if (expectedLength > 0 && expectedLength > availableBytes) {
                throw IllegalStateException(
                    "No hay espacio suficiente para descargar el APK."
                )
            }

            val digest = MessageDigest.getInstance("SHA-256")
            var totalBytes = 0L

            connection.inputStream.use { input ->
                FileOutputStream(file).use { output ->
                    val buffer = ByteArray(64 * 1024)

                    while (true) {
                        coroutineContext.ensureActive()

                        val bytesRead = input.read(buffer)
                        if (bytesRead < 0) break

                        output.write(buffer, 0, bytesRead)
                        digest.update(buffer, 0, bytesRead)
                        totalBytes += bytesRead

                        val percent = if (expectedLength > 0) {
                            ((totalBytes * 100) / expectedLength)
                                .toInt()
                                .coerceIn(0, 100)
                        } else {
                            null
                        }

                        onProgress(percent, totalBytes)
                    }

                    output.fd.sync()
                }
            }

            require(file.isFile && file.length() > 0) {
                "El archivo descargado está vacío."
            }

            val hash = digest.digest().joinToString("") {
                "%02x".format(it)
            }

            // Si se configuró una huella de confianza, debe coincidir.
            PackageRepository.EXPECTED_SHA256?.let { expectedHash ->
                require(hash.equals(expectedHash.trim(), ignoreCase = true)) {
                    "La huella SHA-256 no coincide. Se rechazó el APK."
                }
            }

            DownloadedApk(
                file = file,
                sha256 = hash,
                size = totalBytes
            )
        } catch (e: Exception) {
            file.delete()
            throw e
        } finally {
            connection.disconnect()
        }
    }

    /**
     * Comprueba que el archivo sea un APK reconocible y que su paquete
     * y versión coincidan con los esperados.
     *
     * Esta función no autentica al editor del APK y no compara su firma
     * con la aplicación instalada. La procedencia debe verificarse
     * mediante una fuente confiable o una huella SHA-256 confiable.
     */
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
            "El archivo descargado no se reconoce como un APK válido."
        )

        require(info.packageName == PackageRepository.TARGET_PACKAGE) {
            "Paquete inesperado: ${info.packageName}. " +
                "Se esperaba ${PackageRepository.TARGET_PACKAGE}."
        }

        require(info.versionName == PackageRepository.TARGET_VERSION) {
            "Versión inesperada: ${info.versionName ?: "desconocida"}. " +
                "Se esperaba ${PackageRepository.TARGET_VERSION}."
        }

        return "APK reconocido. Paquete y versión coinciden."
    }
}
