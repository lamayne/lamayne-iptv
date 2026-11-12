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

    // Signing out forgets the account but keeps favourites and recent channels.
    fun clear() {
        prefs.edit().remove("server").remove("user").remove("pass").apply()
    }
}

// A short list of channels (favourites, recent channels) kept per account.
class ChannelListStore(
    context: Context,
    private val prefix: String,
    private val limit: Int,
) {
    private val prefs = context.getSharedPreferences("lamayne_tv", Context.MODE_PRIVATE)

    private fun key(account: Credentials) =
        "$prefix${(account.server + "|" + account.user).hashCode()}"

    fun load(account: Credentials): List<Channel> {
        val raw = prefs.getString(key(account), null) ?: return emptyList()

        return try {
            val array = JSONArray(raw)
            val channels = ArrayList<Channel>()

            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val id = item.optString("id")

                if (id.isEmpty()) continue

                channels.add(
                    Channel(
                        id = id,
                        name = item.optString("name"),
                        icon = item.optString("icon").ifEmpty { null },
                        categoryId = item.optString("cat").ifEmpty { null },
                    )
                )
            }

            channels
        } catch (e: JSONException) {
            emptyList()
        }
    }

    fun save(account: Credentials, channels: List<Channel>) {
        val array = JSONArray()

        for (channel in channels.take(limit)) {
            array.put(
                JSONObject()
                    .put("id", channel.id)
                    .put("name", channel.name)
                    .put("icon", channel.icon ?: "")
                    .put("cat", channel.categoryId ?: "")
            )
        }

        prefs.edit().putString(key(account), array.toString()).apply()
    }
}
