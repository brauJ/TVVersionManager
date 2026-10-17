package com.example.tvversionmanager.data

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.DisplayMetrics
import android.content.res.AssetManager
import android.content.pm.PackageInfo
import android.content.pm.Signature
import android.content.pm.SigningInfo
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.StatFs
import android.util.Log
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlin.coroutines.coroutineContext

data class DownloadedApk(val file: File, val sha256: String, val size: Long)

class ApkDownloader(private val context: Context) {
    suspend fun download(onProgress: (percent: Int?, bytes: Long) -> Unit): DownloadedApk =
        withContext(Dispatchers.IO) {
            val url = URL(PackageRepository.APK_URL)
            require(url.protocol == "https") { "La URL no usa HTTPS." }
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
                require(code in 200..299) { "El servidor respondió HTTP $code." }
                val expectedLength = connection.contentLengthLong
                val available = StatFs(context.cacheDir.absolutePath).availableBytes
                if (expectedLength > 0 && expectedLength > available) {
                    throw IllegalStateException("No hay espacio suficiente para descargar el APK.")
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
                            val percent = if (expectedLength > 0) ((total * 100) / expectedLength).toInt().coerceIn(0, 100) else null
                            onProgress(percent, total)
                        }
                        output.fd.sync()
                    }
                }
                require(file.length() > 0) { "El archivo descargado está vacío." }
                val hash = digest.digest().joinToString("") { "%02x".format(it) }
                PackageRepository.EXPECTED_SHA256?.let { expected ->
                    require(hash.equals(expected, ignoreCase = true)) { "La huella SHA-256 no coincide." }
                }
                DownloadedApk(file, hash, total)
            } catch (e: Throwable) {
                file.delete()
                throw e
            } finally {
                connection.disconnect()
            }
        }

    /**
     * PackageManager.getPackageArchiveInfo valida que el archivo sea reconocible como APK
     * y permite leer paquete/versión. La firma se compara con la app instalada cuando existe.
     * Para una instalación nueva, solo una huella SHA-256 configurada de fuente confiable
     * puede anclar el archivo descargado; la firma por sí sola no autentica al editor esperado.
     */
    fun validate(file: File): String {
        require(file.isFile && file.length() > 0) { "El archivo APK no es válido." }
        val pm = context.packageManager
        val info = if (Build.VERSION.SDK_INT >= 33) {
            pm.getPackageArchiveInfo(file.absolutePath, PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong()))
        } else {
            @Suppress("DEPRECATION")
            pm.getPackageArchiveInfo(file.absolutePath, PackageManager.GET_SIGNING_CERTIFICATES)
        } ?: throw IllegalArgumentException("El archivo no se reconoce como un APK válido.")
        require(info.packageName == PackageRepository.TARGET_PACKAGE) {
            "Paquete inesperado: ${info.packageName}. Se esperaba ${PackageRepository.TARGET_PACKAGE}."
        }
        require(info.versionName == PackageRepository.TARGET_VERSION) {
            "Versión inesperada: ${info.versionName ?: "desconocida"}. Se esperaba ${PackageRepository.TARGET_VERSION}."
        }

        val installedInfo = try {
            if (Build.VERSION.SDK_INT >= 33) pm.getPackageInfo(PackageRepository.TARGET_PACKAGE,
                PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong()))
            else {
                @Suppress("DEPRECATION")
                pm.getPackageInfo(PackageRepository.TARGET_PACKAGE, PackageManager.GET_SIGNING_CERTIFICATES)
            }
        } catch (_: Exception) { null }

        if (installedInfo != null) {
            val archiveSigners = info.signingInfo?.apkContentsSigners?.map { it.toCharsString() }?.toSet().orEmpty()
            val installedSigners = installedInfo.signingInfo?.apkContentsSigners?.map { it.toCharsString() }?.toSet().orEmpty()
            require(archiveSigners.isNotEmpty() && installedSigners.isNotEmpty() && archiveSigners == installedSigners) {
                "La firma del APK no coincide con la aplicación instalada. Se rechazó el archivo."
            }
        } else if (PackageRepository.EXPECTED_SHA256 == null) {
            throw IllegalArgumentException(
                "No se puede autenticar la procedencia del APK para una instalación nueva: configura EXPECTED_SHA256 con una huella obtenida por un canal confiable."
            )
        }
        return "APK válido: paquete y versión coinciden."
    }
}
