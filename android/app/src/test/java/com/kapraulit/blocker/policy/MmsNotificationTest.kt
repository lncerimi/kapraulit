package com.kapraulit.blocker.policy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.ByteArrayOutputStream

class MmsNotificationTest {
    private fun pdu(build: ByteArrayOutputStream.() -> Unit) = ByteArrayOutputStream().apply(build).toByteArray()

    private fun ByteArrayOutputStream.bytes(vararg values: Int) = values.forEach { write(it) }

    private fun ByteArrayOutputStream.text(value: String) {
        write(value.toByteArray(Charsets.UTF_8))
        write(0)
    }

    /** message-type, transaction-id and version, as every m-notification-ind starts. */
    private fun ByteArrayOutputStream.preamble() {
        bytes(0x8C, 0x82)
        bytes(0x98); text("T12345")
        bytes(0x8D, 0x92)
    }

    @Test
    fun readsPlainSender() {
        val address = "+38970123456/TYPE=PLMN"
        val data = pdu {
            preamble()
            bytes(0x89, address.length + 2, 0x80); text(address)
            bytes(0x83); text("http://mms.example/abc")
        }
        assertEquals("+38970123456", MmsNotification.senderOf(data))
    }

    @Test
    fun readsSenderWithCharset() {
        val address = "+15551234567/TYPE=PLMN"
        val data = pdu {
            preamble()
            // From: length, address-present, encoded-string (length, UTF-8 charset, text)
            bytes(0x89, address.length + 4, 0x80, address.length + 2, 0xEA); text(address)
        }
        assertEquals("+15551234567", MmsNotification.senderOf(data))
    }

    @Test
    fun skipsLongHeadersBeforeSender() {
        val data = pdu {
            preamble()
            bytes(0x8E, 0x02, 0x10, 0x00) // message size as long-integer
            bytes(0x88, 0x05, 0x81, 0x03, 0x01, 0x51, 0x80) // relative expiry
            bytes(0x89, 7, 0x80); text("12345")
        }
        assertEquals("12345", MmsNotification.senderOf(data))
    }

    @Test
    fun withheldSenderIsNull() {
        val data = pdu {
            preamble()
            bytes(0x89, 0x01, 0x81)
        }
        assertNull(MmsNotification.senderOf(data))
    }

    @Test
    fun garbageIsNull() {
        assertNull(MmsNotification.senderOf(byteArrayOf()))
        assertNull(MmsNotification.senderOf(byteArrayOf(0x89.toByte())))
        assertNull(MmsNotification.senderOf(byteArrayOf(0x8C.toByte(), 0x82.toByte(), 0x89.toByte(), 0x40)))
    }
}
