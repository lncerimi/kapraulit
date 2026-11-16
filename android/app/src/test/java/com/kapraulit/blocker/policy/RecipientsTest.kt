package com.kapraulit.blocker.policy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RecipientsTest {
    @Test
    fun parsesSingleRecipient() {
        assertEquals(Recipient("+38970123456", null), Recipients.parse("+38970123456"))
    }

    @Test
    fun takesFirstOfSeveralRecipients() {
        assertEquals(Recipient("070123456", null), Recipients.parse("070123456;070999999"))
        assertEquals(Recipient("070123456", null), Recipients.parse(" , 070123456,070999999"))
    }

    @Test
    fun readsBody() {
        assertEquals(Recipient("070123456", "Hello there"), Recipients.parse("070123456?body=Hello there"))
        assertEquals(Recipient("070123456", "Hi"), Recipients.parse("//070123456?subject=x&body=Hi"))
    }

    @Test
    fun emptyIsNull() {
        assertNull(Recipients.parse(null))
        assertNull(Recipients.parse(""))
        assertNull(Recipients.parse("?body=hi"))
    }
}
