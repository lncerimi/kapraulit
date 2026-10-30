package com.kapraulit.blocker.policy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneNumbersTest {
    @Test
    fun hiddenNumbers() {
        assertTrue(PhoneNumbers.isHidden(null))
        assertTrue(PhoneNumbers.isHidden(""))
        assertTrue(PhoneNumbers.isHidden("  "))
        assertTrue(PhoneNumbers.isHidden("-"))
        assertFalse(PhoneNumbers.isHidden("+38970123456"))
    }

    @Test
    fun normalizeKeepsInternationalPrefix() {
        assertEquals("+38970123456", PhoneNumbers.normalize("+389 70 123-456"))
        assertEquals("+38970123456", PhoneNumbers.normalize("00389 70 123 456"))
        assertEquals("070123456", PhoneNumbers.normalize("070 123 456"))
        assertEquals("bank", PhoneNumbers.normalize(" BANK "))
    }

    @Test
    fun localAndInternationalFormsMatch() {
        assertTrue(PhoneNumbers.sameNumber("070 123 456", "+389 70 123 456"))
        assertTrue(PhoneNumbers.sameNumber("(555) 123-4567", "+1 555 123 4567"))
    }

    @Test
    fun differentNumbersDoNotMatch() {
        assertFalse(PhoneNumbers.sameNumber("070 123 456", "070 123 457"))
        assertFalse(PhoneNumbers.sameNumber("12345", "912345"))
        assertFalse(PhoneNumbers.sameNumber(null, null))
        assertFalse(PhoneNumbers.sameNumber("BANK", "BANKA"))
    }

    @Test
    fun serviceSenders() {
        assertTrue(PhoneNumbers.isServiceSender("BANK"))
        assertTrue(PhoneNumbers.isServiceSender("Google"))
        assertTrue(PhoneNumbers.isServiceSender("12345"))
        assertFalse(PhoneNumbers.isServiceSender("+38970123456"))
        assertFalse(PhoneNumbers.isServiceSender("070123456"))
        assertFalse(PhoneNumbers.isServiceSender(null))
    }
}
