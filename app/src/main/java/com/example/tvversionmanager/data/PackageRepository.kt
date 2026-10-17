package com.example.tvversionmanager.data

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import com.example.tvversionmanager.model.InstalledApp

class PackageRepository(private val context: Context) {
    fun findTarget(): InstalledApp? {
        val pm = context.packageManager
        val packageName = TARGET_PACKAGE
        val info = if (Build.VERSION.SDK_INT >= 33) {
            pm.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
        } else {
            @Suppress("DEPRECATION")
            pm.getPackageInfo(packageName, 0)
        }
        val appInfo = info.applicationInfo ?: return null
        val label = pm.getApplicationLabel(appInfo).toString()
        val code = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else {
            @Suppress("DEPRECATION") info.versionCode.toLong()
        }
        return InstalledApp(label, packageName, info.versionName, code)
    }

    companion object {
        const val TARGET_PACKAGE = "com.android.mgstv"
        const val TARGET_VERSION = "4.34.5"
        const val APK_URL = "https://yoveo.tv/update.apk"
        // Configurar únicamente cuando se obtenga la huella SHA-256 por un canal confiable.
        const val EXPECTED_SHA256: String? = null
    }
}
