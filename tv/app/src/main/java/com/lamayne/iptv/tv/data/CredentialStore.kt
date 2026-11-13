package com.lamayne.iptv.tv.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

// The account (address, user, password) is kept encrypted (see Vault). An account saved in clear
// by an older version is encrypted at the first start and the clear copy is erased.
class CredentialStore(context: Context) {
    private val prefs = context.getSharedPreferences("lamayne_tv", Context.MODE_PRIVATE)

    fun load(): Credentials? {
        prefs.getString("account", null)?.let { sealed ->
            val json = Vault.open(sealed)

            if (json == null) {
                // the key is gone (or the data damaged): signed out, nothing readable remains
                prefs.edit().remove("account").apply()
                return null
            }

            return try {
                val o = JSONObject(json)

                Credentials(o.getString("server"), o.getString("user"), o.getString("pass"))
            } catch (e: JSONException) {
                null
            }
        }

        // from an older version: encrypt, then erase the clear copy
        val server = prefs.getString("server", null)
        val user = prefs.getString("user", null)
        val pass = prefs.getString("pass", null)

        if (server == null || user == null || pass == null) return null

        val legacy = Credentials(server, user, pass)

        save(legacy)

        return legacy
    }

    fun save(credentials: Credentials) {
        val json = JSONObject()
            .put("server", credentials.server)
            .put("user", credentials.user)
            .put("pass", credentials.pass)
            .toString()
        val sealed = Vault.seal(json)

        // a clear copy is never written: without encryption the account is simply not kept
        prefs.edit()
            .remove("server").remove("user").remove("pass")
            .apply {
                if (sealed != null) putString("account", sealed) else remove("account")
            }
            .apply()
    }

    // Signing out forgets the account but keeps favourites, history and settings.
    fun clear() {
        prefs.edit().remove("account").remove("server").remove("user").remove("pass").apply()
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
        val stored = prefs.getString(key(account), null) ?: return emptyList()
        val legacy = !Vault.isSealed(stored)
        val raw = if (legacy) stored else Vault.open(stored) ?: return emptyList()

        return try {
            val array = JSONArray(raw)
            val items = ArrayList<T>()

            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val value = fromJson(item) ?: continue

                items.add(value)
            }

            // a list saved in clear by an older version is encrypted now
            if (legacy) save(account, items)

            items
        } catch (e: JSONException) {
            emptyList()
        }
    }

    fun save(account: Credentials, items: List<T>) {
        val array = JSONArray()

        for (item in items.take(limit)) array.put(toJson(item))

        // encrypted: these lists can hold stream addresses (some contain a password)
        val sealed = Vault.seal(array.toString()) ?: return

        prefs.edit().putString(key(account), sealed).apply()
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

    // false (the default): the last favourite added is at the end of the list.
    var favNewestFirst: Boolean
        get() = prefs.getBoolean("fav_newest_first", false)
        set(value) {
            prefs.edit().putBoolean("fav_newest_first", value).apply()
        }

    // Open the app when the TV starts (needs the "display over other apps" permission).
    var launchAtBoot: Boolean
        get() = prefs.getBoolean("launch_at_boot", false)
        set(value) {
            prefs.edit().putBoolean("launch_at_boot", value).apply()
        }

    // The language of what the home page recommends: "auto" = the language of the app.
    var homeLanguage: String
        get() = prefs.getString("home_lang", "auto") ?: "auto"
        set(value) {
            prefs.edit().putString("home_lang", value).apply()
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
