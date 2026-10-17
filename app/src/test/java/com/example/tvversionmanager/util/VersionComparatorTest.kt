package com.example.tvversionmanager.util

import org.junit.Assert.*
import org.junit.Test

class VersionComparatorTest {
    @Test fun olderVersion() { assertEquals(-1, VersionComparator.compare("4.30.0", "4.34.5")) }
    @Test fun sameVersion() { assertEquals(0, VersionComparator.compare("4.34.5", "4.34.5")) }
    @Test fun newerVersion() { assertEquals(1, VersionComparator.compare("4.35.0", "4.34.5")) }
    @Test fun numericPartsNotLexical() { assertEquals(-1, VersionComparator.compare("4.9.0", "4.34.5")) }
    @Test fun nullOrEmptyInvalid() {
        assertNull(VersionComparator.compare(null, "4.34.5"))
        assertNull(VersionComparator.compare("", "4.34.5"))
        assertNull(VersionComparator.compare("4..5", "4.34.5"))
        assertNull(VersionComparator.compare("x.y.z", "4.34.5"))
    }
}
