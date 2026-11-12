package com.lamayne.iptv.tv

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lamayne.iptv.tv.data.Category
import com.lamayne.iptv.tv.data.Channel
import com.lamayne.iptv.tv.data.ChannelListStore
import com.lamayne.iptv.tv.data.CredentialStore
import com.lamayne.iptv.tv.data.Credentials
import com.lamayne.iptv.tv.data.EpgEntry
import com.lamayne.iptv.tv.data.EpgInfo
import com.lamayne.iptv.tv.data.XtreamClient
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.text.Normalizer
import java.util.Locale

enum class Section { LIVE, FAVORITES, RECENT, SEARCH }

private val ACCENT_MARKS = Regex("\\p{M}+")

// Lower case, no accents: "Télé" and "tele" match.
fun normalizeText(value: String): String =
    Normalizer.normalize(value, Normalizer.Form.NFD)
        .replace(ACCENT_MARKS, "")
        .lowercase(Locale.ROOT)

class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val credentialStore = CredentialStore(application)
    private val favoriteStore = ChannelListStore(application, "fav_", 500)
    private val recentStore = ChannelListStore(application, "recent_", 24)

    private val _credentials = MutableStateFlow(credentialStore.load())
    val credentials: StateFlow<Credentials?> = _credentials.asStateFlow()

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _section = MutableStateFlow(Section.LIVE)
    val section: StateFlow<Section> = _section.asStateFlow()

    // Live TV
    private val _categories = MutableStateFlow<List<Category>>(emptyList())
    val categories: StateFlow<List<Category>> = _categories.asStateFlow()

    private val _selectedCategory = MutableStateFlow<Category?>(null)
    val selectedCategory: StateFlow<Category?> = _selectedCategory.asStateFlow()

    private val _channels = MutableStateFlow<List<Channel>>(emptyList())
    val channels: StateFlow<List<Channel>> = _channels.asStateFlow()

    // Favourites and recent channels
    private val _favorites = MutableStateFlow<List<Channel>>(emptyList())
    val favorites: StateFlow<List<Channel>> = _favorites.asStateFlow()

    private val _recents = MutableStateFlow<List<Channel>>(emptyList())
    val recents: StateFlow<List<Channel>> = _recents.asStateFlow()

    // The channel under the cursor in a list, and its programme
    private val _focused = MutableStateFlow<Channel?>(null)
    val focused: StateFlow<Channel?> = _focused.asStateFlow()

    private val _focusedEpg = MutableStateFlow<EpgInfo?>(null)
    val focusedEpg: StateFlow<EpgInfo?> = _focusedEpg.asStateFlow()

    // Playback
    private val _playing = MutableStateFlow<Channel?>(null)
    val playing: StateFlow<Channel?> = _playing.asStateFlow()

    private val _playingEpg = MutableStateFlow<EpgInfo?>(null)
    val playingEpg: StateFlow<EpgInfo?> = _playingEpg.asStateFlow()

    // Search
    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _searchResults = MutableStateFlow<List<Channel>>(emptyList())
    val searchResults: StateFlow<List<Channel>> = _searchResults.asStateFlow()

    private val _searchLoading = MutableStateFlow(false)
    val searchLoading: StateFlow<Boolean> = _searchLoading.asStateFlow()

    private var channelJob: Job? = null
    private var focusJob: Job? = null
    private var playingEpgJob: Job? = null
    private var searchJob: Job? = null
    private var loadAllJob: Job? = null

    // The list the current channel was started from: up/down zap inside it.
    private var queue: List<Channel> = emptyList()

    private var allChannels: List<Channel> = emptyList()
    private var allKeys: List<String> = emptyList()

    private val epgCache = HashMap<String, Pair<Long, List<EpgEntry>>>()

    init {
        _credentials.value?.let { credentials ->
            loadSavedLists(credentials)
            viewModelScope.launch { loadAll(credentials) }
        }
    }

    // ------------------------------------------------------------------ account

    // Typing a long address with a remote is painful. For testing, the account
    // can be given from a computer: adb shell am start -n
    // com.lamayne.iptv.tv/.MainActivity --es server ... --es user ... --es pass ...
    fun loginFromIntent(server: String?, user: String?, pass: String?) {
        if (_credentials.value == null && server != null && user != null && pass != null) {
            login(server, user, pass)
        }
    }

    fun login(serverRaw: String, user: String, pass: String) {
        val server = XtreamClient.normalizeServer(serverRaw)

        if (server.isEmpty() || user.isBlank() || pass.isBlank()) {
            _error.value = "Fill in the server address, the username and the password."
            return
        }

        val credentials = Credentials(server, user.trim(), pass)

        viewModelScope.launch {
            _busy.value = true
            _error.value = null

            try {
                XtreamClient.authenticate(credentials)
                credentialStore.save(credentials)
                _credentials.value = credentials
                loadSavedLists(credentials)
                loadCategories(credentials)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _error.value = describe(e)
            } finally {
                _busy.value = false
            }
        }
    }

    fun logout() {
        channelJob?.cancel()
        focusJob?.cancel()
        playingEpgJob?.cancel()
        searchJob?.cancel()
        loadAllJob?.cancel()
        credentialStore.clear()
        _credentials.value = null
        _categories.value = emptyList()
        _selectedCategory.value = null
        _channels.value = emptyList()
        _favorites.value = emptyList()
        _recents.value = emptyList()
        _focused.value = null
        _focusedEpg.value = null
        _playing.value = null
        _playingEpg.value = null
        _searchQuery.value = ""
        _searchResults.value = emptyList()
        _section.value = Section.LIVE
        _error.value = null
        allChannels = emptyList()
        allKeys = emptyList()
        epgCache.clear()
        queue = emptyList()
    }

    private fun loadSavedLists(credentials: Credentials) {
        _favorites.value = favoriteStore.load(credentials)
        _recents.value = recentStore.load(credentials)
    }

    // ------------------------------------------------------------------ browsing

    fun selectSection(section: Section) {
        _section.value = section

        if (section == Section.SEARCH) ensureAllChannels()
    }

    fun selectCategory(category: Category) {
        val credentials = _credentials.value ?: return

        channelJob?.cancel()
        channelJob = viewModelScope.launch {
            _busy.value = true
            _error.value = null

            try {
                loadChannels(credentials, category)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _error.value = describe(e)
            } finally {
                _busy.value = false
            }
        }
    }

    fun retry() {
        val credentials = _credentials.value ?: return
        val category = _selectedCategory.value

        if (category == null) {
            viewModelScope.launch { loadAll(credentials) }
        } else {
            selectCategory(category)
        }
    }

    private suspend fun loadAll(credentials: Credentials) {
        _busy.value = true
        _error.value = null

        try {
            loadCategories(credentials)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            _error.value = describe(e)
        } finally {
            _busy.value = false
        }
    }

    private suspend fun loadCategories(credentials: Credentials) {
        val list = XtreamClient.liveCategories(credentials)

        _categories.value = list

        val first = list.firstOrNull()

        if (first != null) loadChannels(credentials, first)
    }

    private suspend fun loadChannels(credentials: Credentials, category: Category) {
        _selectedCategory.value = category
        _channels.value = emptyList()
        _channels.value = XtreamClient.liveChannels(credentials, category.id)
    }

    // ------------------------------------------------------------------ guide

    // The programme under the cursor is looked up after a short pause, so that
    // moving fast through a list does not send one request per channel.
    fun focusChannel(channel: Channel) {
        if (_focused.value?.id == channel.id) return

        _focused.value = channel
        _focusedEpg.value = null
        focusJob?.cancel()
        focusJob = viewModelScope.launch {
            delay(300)
            _focusedEpg.value = fetchEpg(channel.id)
        }
    }

    private suspend fun fetchEpg(streamId: String): EpgInfo {
        val credentials = _credentials.value ?: return EpgInfo.EMPTY
        val nowMillis = System.currentTimeMillis()
        val cached = epgCache[streamId]

        if (cached != null && nowMillis - cached.first < 120_000) {
            return EpgInfo.from(cached.second, nowMillis / 1000)
        }

        return try {
            val entries = XtreamClient.shortEpg(credentials, streamId)

            epgCache[streamId] = nowMillis to entries
            EpgInfo.from(entries, nowMillis / 1000)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            EpgInfo.EMPTY
        }
    }

    // ------------------------------------------------------------------ favourites

    fun toggleFavorite(channel: Channel) {
        val credentials = _credentials.value ?: return
        val current = _favorites.value
        val updated =
            if (current.any { it.id == channel.id }) {
                current.filterNot { it.id == channel.id }
            } else {
                listOf(channel) + current
            }

        _favorites.value = updated
        favoriteStore.save(credentials, updated)
    }

    private fun rememberRecent(channel: Channel) {
        val credentials = _credentials.value ?: return
        val updated = (listOf(channel) + _recents.value.filterNot { it.id == channel.id }).take(24)

        _recents.value = updated
        recentStore.save(credentials, updated)
    }

    // ------------------------------------------------------------------ playback

    fun play(channel: Channel, list: List<Channel>) {
        queue = if (list.any { it.id == channel.id }) list else listOf(channel)
        startPlaying(channel)
    }

    // Next (+1) or previous (-1) channel of the list the current one came from.
    fun zap(delta: Int) {
        val current = _playing.value ?: return

        if (queue.size < 2) return

        val index = queue.indexOfFirst { it.id == current.id }.coerceAtLeast(0)

        startPlaying(queue[Math.floorMod(index + delta, queue.size)])
    }

    fun stop() {
        playingEpgJob?.cancel()
        _playing.value = null
        _playingEpg.value = null
    }

    private fun startPlaying(channel: Channel) {
        _playing.value = channel
        _playingEpg.value = null
        rememberRecent(channel)
        playingEpgJob?.cancel()
        playingEpgJob = viewModelScope.launch {
            while (isActive) {
                _playingEpg.value = fetchEpg(channel.id)
                delay(60_000)
            }
        }
    }

    // ------------------------------------------------------------------ search

    fun setSearchQuery(text: String) {
        _searchQuery.value = text
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(250)
            runSearch(text)
        }
    }

    // The whole channel list is downloaded once, the first time Search is opened.
    private fun ensureAllChannels() {
        val credentials = _credentials.value ?: return

        if (allChannels.isNotEmpty() || loadAllJob?.isActive == true) return

        loadAllJob = viewModelScope.launch {
            _searchLoading.value = true

            try {
                val list = XtreamClient.allLiveChannels(credentials)
                val keys = withContext(Dispatchers.Default) {
                    list.map { normalizeText(it.name) }
                }

                allChannels = list
                allKeys = keys
                runSearch(_searchQuery.value)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _error.value = describe(e)
            } finally {
                _searchLoading.value = false
            }
        }
    }

    private suspend fun runSearch(text: String) {
        val query = normalizeText(text).trim()
        val all = allChannels
        val keys = allKeys

        _searchResults.value =
            withContext(Dispatchers.Default) {
                if (query.length < 2) {
                    emptyList()
                } else {
                    val startsWith = ArrayList<Channel>()
                    val contains = ArrayList<Channel>()

                    for (index in all.indices) {
                        val key = keys[index]

                        if (key.startsWith(query)) {
                            startsWith.add(all[index])
                        } else if (key.contains(query)) {
                            contains.add(all[index])
                        }

                        if (startsWith.size + contains.size >= 400) break
                    }

                    (startsWith + contains).take(120)
                }
            }
    }

    // ------------------------------------------------------------------ errors

    private fun describe(e: Exception): String =
        when (e) {
            is XtreamClient.AuthException ->
                "The server refused these credentials. Check the username and password, and that the account is active."
            is IllegalArgumentException ->
                "That server address does not look valid."
            is UnknownHostException ->
                "Server not found. Check the address and the internet connection."
            is SocketTimeoutException ->
                "The server took too long to answer. Try again."
            is XtreamClient.HttpException ->
                "The server answered with HTTP ${e.code}."
            else ->
                e.message ?: "Something went wrong."
        }
}
