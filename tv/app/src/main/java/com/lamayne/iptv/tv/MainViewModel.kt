package com.lamayne.iptv.tv

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lamayne.iptv.tv.data.Category
import com.lamayne.iptv.tv.data.Channel
import com.lamayne.iptv.tv.data.CredentialStore
import com.lamayne.iptv.tv.data.Credentials
import com.lamayne.iptv.tv.data.XtreamClient
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.net.SocketTimeoutException
import java.net.UnknownHostException

class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val store = CredentialStore(application)

    private val _credentials = MutableStateFlow(store.load())
    val credentials: StateFlow<Credentials?> = _credentials.asStateFlow()

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _categories = MutableStateFlow<List<Category>>(emptyList())
    val categories: StateFlow<List<Category>> = _categories.asStateFlow()

    private val _selectedCategory = MutableStateFlow<Category?>(null)
    val selectedCategory: StateFlow<Category?> = _selectedCategory.asStateFlow()

    private val _channels = MutableStateFlow<List<Channel>>(emptyList())
    val channels: StateFlow<List<Channel>> = _channels.asStateFlow()

    private val _playing = MutableStateFlow<Channel?>(null)
    val playing: StateFlow<Channel?> = _playing.asStateFlow()

    private var channelJob: Job? = null

    init {
        _credentials.value?.let { credentials ->
            viewModelScope.launch { loadAll(credentials) }
        }
    }

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
                store.save(credentials)
                _credentials.value = credentials
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
        store.clear()
        _credentials.value = null
        _categories.value = emptyList()
        _selectedCategory.value = null
        _channels.value = emptyList()
        _playing.value = null
        _error.value = null
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

    fun play(channel: Channel) {
        _playing.value = channel
    }

    fun stop() {
        _playing.value = null
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
