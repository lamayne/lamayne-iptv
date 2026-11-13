package com.lamayne.iptv.tv.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

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

    // Signing out forgets the account but keeps favourites, history and settings.
    fun clear() {
        prefs.edit().remove("server").remove("user").remove("pass").apply()
    }
}

// A short list (favourites, recent channels, progress...) kept per account.
class JsonListStore<T>(
    context: Context,
    private val prefix: String,
    private val limit: Int,
    private val toJson: (T) -> JSONObject,
    private val fromJson: (JSONObject) -> T?,
) {
    private val prefs = context.getSharedPreferences("lamayne_tv", Context.MODE_PRIVATE)

    private fun key(account: Credentials) =
        "$prefix${(account.server + "|" + account.user).hashCode()}"

    fun load(account: Credentials): List<T> {
        val raw = prefs.getString(key(account), null) ?: return emptyList()

        return try {
            val array = JSONArray(raw)
            val items = ArrayList<T>()

            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val value = fromJson(item) ?: continue

                items.add(value)
            }

            items
        } catch (e: JSONException) {
            emptyList()
        }
    }

    fun save(account: Credentials, items: List<T>) {
        val array = JSONArray()

        for (item in items.take(limit)) array.put(toJson(item))

        prefs.edit().putString(key(account), array.toString()).apply()
    }
}

// Language and hidden categories.
class SettingsStore(context: Context) {
    private val prefs = context.getSharedPreferences("lamayne_tv", Context.MODE_PRIVATE)

    var language: String
        get() = prefs.getString("lang", "system") ?: "system"
        set(value) {
            prefs.edit().putString("lang", value).apply()
        }

    // 0 = fit, 1 = zoom (fills the screen, crops the edges), 2 = stretch
    var aspect: Int
        get() = prefs.getInt("aspect", 0)
        set(value) {
            prefs.edit().putInt("aspect", value).apply()
        }

    // Hardware-synchronised playback: smoother for heavy (4K) pictures on most TVs.
    var tunneling: Boolean
        get() = prefs.getBoolean("tunneling", true)
        set(value) {
            prefs.edit().putBoolean("tunneling", value).apply()
        }

    private fun hiddenKey(account: Credentials, kind: MediaKind) =
        "hidden_${kind.name}_${(account.server + "|" + account.user).hashCode()}"

    fun hidden(account: Credentials, kind: MediaKind): Set<String> =
        HashSet(prefs.getStringSet(hiddenKey(account, kind), emptySet()) ?: emptySet())

    fun setHidden(account: Credentials, kind: MediaKind, ids: Set<String>) {
        prefs.edit().putStringSet(hiddenKey(account, kind), HashSet(ids)).apply()
    }
}
