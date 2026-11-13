package com.lamayne.iptv.tv.data

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

// What is private (the account, and lists that may hold stream addresses with a password
// inside) is encrypted with AES-256-GCM. The key is created inside the Android Keystore: it
// never leaves the secure hardware / system service, so the files of the app alone are
// useless (a copy of the app's data cannot be read).
object Vault {
    private const val ALIAS = "lamayne_tv_vault"
    private const val PREFIX = "enc1:"
    private const val IV_BYTES = 12

    fun isSealed(text: String): Boolean = text.startsWith(PREFIX)

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

        (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")

        generator.init(
            KeyGenParameterSpec.Builder(
                ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )

        return generator.generateKey()
    }

    // Null when the device cannot encrypt: the caller then keeps nothing (never in clear).
    fun seal(plain: String): String? =
        try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")

            cipher.init(Cipher.ENCRYPT_MODE, key())

            val encrypted = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))

            PREFIX + Base64.encodeToString(cipher.iv + encrypted, Base64.NO_WRAP)
        } catch (e: Exception) {
            null
        }

    fun open(sealed: String): String? =
        try {
            if (!isSealed(sealed)) {
                null
            } else {
                val data = Base64.decode(sealed.removePrefix(PREFIX), Base64.NO_WRAP)
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")

                cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, data, 0, IV_BYTES))

                String(cipher.doFinal(data, IV_BYTES, data.size - IV_BYTES), Charsets.UTF_8)
            }
        } catch (e: Exception) {
            null
        }
}
