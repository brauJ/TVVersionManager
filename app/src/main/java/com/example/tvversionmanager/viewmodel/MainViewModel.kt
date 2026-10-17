package com.example.tvversionmanager.viewmodel

import android.app.Application
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.tvversionmanager.data.ApkDownloader
import com.example.tvversionmanager.data.PackageRepository
import com.example.tvversionmanager.model.AppStatus
import com.example.tvversionmanager.model.VersionRelation
import com.example.tvversionmanager.util.VersionComparator
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File

class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val repo = PackageRepository(application)
    private val downloader = ApkDownloader(application)
    private val _state = MutableStateFlow(AppStatus())
    val state: StateFlow<AppStatus> = _state.asStateFlow()
    private var downloadJob: Job? = null
    private var validatedFile: File? = null

    fun check() {
        viewModelScope.launch {
            try {
                val app = repo.findTarget()
                if (app == null) {
                    _state.value = AppStatus(relation = VersionRelation.MISSING, message = "No se encontró XUPER TV / MAGIS TV en este dispositivo.")
                    return@launch
                }
                val cmp = VersionComparator.compare(app.versionName, PackageRepository.TARGET_VERSION)
                val relation = when (cmp) {
                    null -> VersionRelation.UNKNOWN
                    -1 -> VersionRelation.OLDER
                    0 -> VersionRelation.SAME
                    else -> VersionRelation.NEWER
                }
                val message = when (relation) {
                    VersionRelation.OLDER -> "Hay una versión más reciente disponible: ${PackageRepository.TARGET_VERSION}."
                    VersionRelation.SAME -> "Tu aplicación ya está en la versión correcta."
                    VersionRelation.NEWER -> "La versión instalada es superior a la versión objetivo. Para instalar la ${PackageRepository.TARGET_VERSION} podría ser necesario desinstalar la versión actual."
                    VersionRelation.UNKNOWN -> "No se pudo interpretar la versión instalada."
                    VersionRelation.MISSING -> "No se encontró XUPER TV / MAGIS TV en este dispositivo."
                }
                _state.value = AppStatus(installed = app, relation = relation, message = message)
            } catch (e: Exception) {
                _state.value = AppStatus(relation = VersionRelation.UNKNOWN, message = "No se pudo consultar la aplicación.", error = e.localizedMessage)
            }
        }
    }

    fun download() {
        if (downloadJob?.isActive == true) return
        downloadJob = viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, progress = 0, downloadedBytes = 0, error = null)
            try {
                val result = downloader.download { percent, bytes ->
                    _state.value = _state.value.copy(progress = percent, downloadedBytes = bytes)
                }
                downloader.validate(result.file)
                validatedFile = result.file
                _state.value = _state.value.copy(busy = false, progress = 100, error = null,
                    message = "APK validado. Huella SHA-256: ${result.sha256}")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.value = _state.value.copy(busy = false, error = e.localizedMessage ?: "Error de descarga o validación.")
            }
        }
    }

    fun cancelDownload() {
        downloadJob?.cancel()
        _state.value = _state.value.copy(busy = false, progress = null, error = "Descarga cancelada.")
    }

    fun installerIntent(): Intent? {
        val file = validatedFile ?: return null
        val context = getApplication<Application>()
        if (!context.packageManager.canRequestPackageInstalls()) {
            _state.value = _state.value.copy(installPermissionNeeded = true)
            return null
        }
        return try {
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.provider", file)
            Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        } catch (e: Exception) {
            _state.value = _state.value.copy(error = e.localizedMessage ?: "No se pudo abrir el instalador.")
            null
        }
    }

    fun installPermissionIntent(): Intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
        Uri.parse("package:${getApplication<Application>().packageName}"))

    fun refreshAfterInstall() = check()
}
