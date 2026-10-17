package com.example.tvversionmanager.util

/**
 * Compara versiones numéricas separadas por puntos (p. ej. 4.9.0 y 4.34.5).
 * Devuelve null si alguna versión no es válida.
 */
object VersionComparator {
    fun compare(installed: String?, target: String): Int? {
        fun parse(value: String?): List<Int>? {
            if (value.isNullOrBlank()) return null
            val parts = value.split(".")
            if (parts.isEmpty() || parts.any { it.isEmpty() || it.any { c -> !c.isDigit() } }) return null
            return parts.map { it.toIntOrNull() ?: return null }
        }
        val a = parse(installed) ?: return null
        val b = parse(target) ?: return null
        for (i in 0 until maxOf(a.size, b.size)) {
            val av = a.getOrElse(i) { 0 }
            val bv = b.getOrElse(i) { 0 }
            if (av != bv) return av.compareTo(bv)
        }
        return 0
    }
}
