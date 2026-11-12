package com.lamayne.iptv.tv.data

import android.content.Context

// Test build: the account is kept in the app's private storage (not encrypted yet).
class CredentialStore(context: Context) {
    private val prefs = context.getSharedPreferences("lamayne_tv", Context.MODE_PRIVATE)

    fun load(): Credentials? {
        val server = prefs.getString("server", null) ?: return null
        val user = prefs.getString("user", null) ?: return null
        val pass = prefs.getString("pass", null) ?: return null

        return Credentials(server, user, pass)
    }

    fun save(credentials: Credentials) {
        prefs.edit()
            .putString("server", credentials.server)
            .putString("user", credentials.user)
            .putString("pass", credentials.pass)
            .apply()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }
}
