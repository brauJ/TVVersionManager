package com.example.tvversionmanager.model

data class InstalledApp(
    val label: String,
    val packageName: String,
    val versionName: String?,
    val versionCode: Long
)

enum class VersionRelation { MISSING, OLDER, SAME, NEWER, UNKNOWN }

data class AppStatus(
    val installed: InstalledApp? = null,
    val relation: VersionRelation = VersionRelation.UNKNOWN,
    val message: String = "Comprobando aplicación…",
    val busy: Boolean = false,
    val progress: Int? = null,
    val downloadedBytes: Long = 0,
    val error: String? = null,
    val installPermissionNeeded: Boolean = false
)
