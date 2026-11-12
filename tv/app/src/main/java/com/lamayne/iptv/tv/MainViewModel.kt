package com.lamayne.iptv.tv

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lamayne.iptv.tv.data.BrowseController
import com.lamayne.iptv.tv.data.Category
import com.lamayne.iptv.tv.data.Channel
import com.lamayne.iptv.tv.data.CredentialStore
import com.lamayne.iptv.tv.data.Credentials
import com.lamayne.iptv.tv.data.Episode
import com.lamayne.iptv.tv.data.EpgEntry
import com.lamayne.iptv.tv.data.EpgInfo
import com.lamayne.iptv.tv.data.Featured
import com.lamayne.iptv.tv.data.Filmography
import com.lamayne.iptv.tv.data.JsonListStore
import com.lamayne.iptv.tv.data.Loadable
import com.lamayne.iptv.tv.data.MediaInfo
import com.lamayne.iptv.tv.data.MediaKind
import com.lamayne.iptv.tv.data.Movie
import com.lamayne.iptv.tv.data.Series
import com.lamayne.iptv.tv.data.SeriesInfo
import com.lamayne.iptv.tv.data.SettingsStore
import com.lamayne.iptv.tv.data.UiError
import com.lamayne.iptv.tv.data.VodRequest
import com.lamayne.iptv.tv.data.WatchProgress
import com.lamayne.iptv.tv.data.XtreamClient
import com.lamayne.iptv.tv.data.channelFromJson
import com.lamayne.iptv.tv.data.channelToJson
import com.lamayne.iptv.tv.data.movieFromJson
import com.lamayne.iptv.tv.data.movieToJson
import com.lamayne.iptv.tv.data.progressFromJson
import com.lamayne.iptv.tv.data.progressToJson
import com.lamayne.iptv.tv.data.seriesFromJson
import com.lamayne.iptv.tv.data.seriesToJson
import com.lamayne.iptv.tv.data.toUiError
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.text.Normalizer
import java.util.Locale
import kotlin.math.abs

enum class Tab { HOME, LIVE, MOVIES, SERIES, SETTINGS }

// Screens opened on top of the tabs. Back closes the last one.
sealed interface Route {
    data class MovieDetails(val movie: Movie) : Route
    data class SeriesDetails(val series: Series) : Route
    data class PlayVod(val request: VodRequest) : Route
    data class ManageCategories(val kind: MediaKind) : Route
    data class Actor(val name: String) : Route
}

// What the page of an actor shows when it is done.
data class ActorResult(val movies: List<Movie>, val actorFound: Boolean, val filmCount: Int)

enum class StepState { RUNNING, DONE, FAILED }

// The three steps of the lookup, shown while the page loads.
data class ActorProgress(
    val lookup: StepState = StepState.RUNNING,
    val catalogue: StepState = StepState.RUNNING,
    val matching: StepState? = null,
    val filmCount: Int = 0,
    val catalogueSize: Int = 0,
)

private val ACCENT_MARKS = Regex("\\p{M}+")

// Lower case, no accents: "Télé" and "tele" match.
fun normalizeText(value: String): String =
    Normalizer.normalize(value, Normalizer.Form.NFD)
        .replace(ACCENT_MARKS, "")
        .lowercase(Locale.ROOT)

// A list of names that can be searched quickly, without accents.
class SearchIndex<T : Any>(private val nameOf: (T) -> String) {
    private var data: Pair<List<T>, List<String>> = Pair(emptyList(), emptyList())

    val size: Int
        get() = data.first.size

    fun items(): List<T> = data.first

    fun set(list: List<T>) {
        data = Pair(list, list.map { normalizeText(nameOf(it)) })
    }

    fun search(query: String, limit: Int): List<T> {
        val (items, keys) = data
        val startsWith = ArrayList<T>()
        val contains = ArrayList<T>()

        for (index in items.indices) {
            val key = keys[index]

            if (key.startsWith(query)) {
                startsWith.add(items[index])
            } else if (key.contains(query)) {
                contains.add(items[index])
            }

            if (startsWith.size + contains.size >= limit * 4) break
        }

        return (startsWith + contains).take(limit)
    }
}

private val LATEST_WORDS = listOf(
    "nouveaut", "recemment", "recent", "latest", "new", "ajout", "novedad", "ultimos", "estreno",
)

// Providers tag their categories with a country: "|FR| NOUVEAUTES", "EN| MOVIES"...
private val CATEGORY_TAG = Regex("^\\s*[|\\[(]?\\s*([A-Za-z]{2,3})\\s*[|\\])]")

private fun categoryTag(name: String): String? =
    CATEGORY_TAG.find(name)?.groupValues?.get(1)?.uppercase(Locale.ROOT)

// The country tags that go with a language of the app.
private fun tagsFor(language: String): Set<String> =
    when (language) {
        "fr" -> setOf("FR", "FRA")
        "es" -> setOf("ES", "SP", "ESP", "LAT")
        else -> setOf("EN", "US", "UK", "GB", "ENG", "USA")
    }

private fun pickLatest(categories: List<Category>, hidden: Set<String>, tags: Set<String>): Category? {
    val visible = categories.filter { it.id !in hidden }
    val inLanguage = visible.filter { categoryTag(it.name) in tags }
    val pool = if (inLanguage.isNotEmpty()) inLanguage else visible

    return pool.firstOrNull { category ->
        val name = normalizeText(category.name)

        LATEST_WORDS.any { name.contains(it) }
    } ?: pool.firstOrNull()
}

private fun metaOf(info: MediaInfo, fallbackRating: String?): String {
    val rating = (info.rating ?: fallbackRating)
        ?.toDoubleOrNull()
        ?.takeIf { it > 0 }
        ?.let { String.format(Locale.US, "%.1f", it) }

    return listOfNotNull(
        info.year,
        info.genre?.take(40),
        rating?.let { "\u2605 $it" },
    ).joinToString("  \u2022  ")
}

class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val credentialStore = CredentialStore(application)
    val settings = SettingsStore(application)

    private val favChannelStore = JsonListStore(application, "fav_", 500, ::channelToJson, ::channelFromJson)
    private val favMovieStore = JsonListStore(application, "favm_", 500, ::movieToJson, ::movieFromJson)
    private val favSeriesStore = JsonListStore(application, "favs_", 500, ::seriesToJson, ::seriesFromJson)
    private val progressStore = JsonListStore(application, "progress_", 150, ::progressToJson, ::progressFromJson)

    // ------------------------------------------------------------------ account

    private val _credentials = MutableStateFlow(credentialStore.load())
    val credentials: StateFlow<Credentials?> = _credentials.asStateFlow()

    private val _loginBusy = MutableStateFlow(false)
    val loginBusy: StateFlow<Boolean> = _loginBusy.asStateFlow()

    private val _loginError = MutableStateFlow<UiError?>(null)
    val loginError: StateFlow<UiError?> = _loginError.asStateFlow()

    // ------------------------------------------------------------------ navigation

    private val _tab = MutableStateFlow(Tab.HOME)
    val tab: StateFlow<Tab> = _tab.asStateFlow()

    private val _stack = MutableStateFlow<List<Route>>(emptyList())
    val stack: StateFlow<List<Route>> = _stack.asStateFlow()

    // ------------------------------------------------------------------ hidden categories

    private val _hiddenLive = MutableStateFlow<Set<String>>(emptySet())
    val hiddenLive: StateFlow<Set<String>> = _hiddenLive.asStateFlow()

    private val _hiddenMovies = MutableStateFlow<Set<String>>(emptySet())
    val hiddenMovies: StateFlow<Set<String>> = _hiddenMovies.asStateFlow()

    private val _hiddenSeries = MutableStateFlow<Set<String>>(emptySet())
    val hiddenSeries: StateFlow<Set<String>> = _hiddenSeries.asStateFlow()

    // ------------------------------------------------------------------ browsing

    val live = BrowseController<Channel>(
        viewModelScope,
        { c -> XtreamClient.liveCategories(c) },
        { c, id -> XtreamClient.liveChannels(c, id) },
        { _hiddenLive.value },
    )

    val movies = BrowseController<Movie>(
        viewModelScope,
        { c -> XtreamClient.movieCategories(c) },
        { c, id -> XtreamClient.movies(c, id) },
        { _hiddenMovies.value },
    )

    val series = BrowseController<Series>(
        viewModelScope,
        { c -> XtreamClient.seriesCategories(c) },
        { c, id -> XtreamClient.series(c, id) },
        { _hiddenSeries.value },
    )

    // ------------------------------------------------------------------ favourites, history

    private val _favChannels = MutableStateFlow<List<Channel>>(emptyList())
    val favChannels: StateFlow<List<Channel>> = _favChannels.asStateFlow()

    private val _favMovies = MutableStateFlow<List<Movie>>(emptyList())
    val favMovies: StateFlow<List<Movie>> = _favMovies.asStateFlow()

    private val _favSeries = MutableStateFlow<List<Series>>(emptyList())
    val favSeries: StateFlow<List<Series>> = _favSeries.asStateFlow()

    private val _progress = MutableStateFlow<List<WatchProgress>>(emptyList())
    val progress: StateFlow<List<WatchProgress>> = _progress.asStateFlow()

    // ------------------------------------------------------------------ home

    private val _featured = MutableStateFlow<List<Featured>>(emptyList())
    val featured: StateFlow<List<Featured>> = _featured.asStateFlow()

    private val _latestMovies = MutableStateFlow<List<Movie>>(emptyList())
    val latestMovies: StateFlow<List<Movie>> = _latestMovies.asStateFlow()

    private val _latestSeries = MutableStateFlow<List<Series>>(emptyList())
    val latestSeries: StateFlow<List<Series>> = _latestSeries.asStateFlow()

    private val _homeLoading = MutableStateFlow(false)
    val homeLoading: StateFlow<Boolean> = _homeLoading.asStateFlow()

    private val _homeError = MutableStateFlow<UiError?>(null)
    val homeError: StateFlow<UiError?> = _homeError.asStateFlow()

    // ------------------------------------------------------------------ guide

    private val _epgMap = MutableStateFlow<Map<String, EpgInfo>>(emptyMap())
    val epgMap: StateFlow<Map<String, EpgInfo>> = _epgMap.asStateFlow()

    // ------------------------------------------------------------------ live playback

    private val _playing = MutableStateFlow<Channel?>(null)
    val playing: StateFlow<Channel?> = _playing.asStateFlow()

    private val _playingEpg = MutableStateFlow<EpgInfo?>(null)
    val playingEpg: StateFlow<EpgInfo?> = _playingEpg.asStateFlow()

    // ------------------------------------------------------------------ details

    private val _movieInfo = MutableStateFlow<Loadable<MediaInfo>>(Loadable.Loading)
    val movieInfo: StateFlow<Loadable<MediaInfo>> = _movieInfo.asStateFlow()

    private val _seriesInfo = MutableStateFlow<Loadable<SeriesInfo>>(Loadable.Loading)
    val seriesInfo: StateFlow<Loadable<SeriesInfo>> = _seriesInfo.asStateFlow()

    // Movies of an actor (found on the filmography site, matched to the catalogue)
    private val _actorMovies = MutableStateFlow<Loadable<ActorResult>>(Loadable.Loading)
    val actorMovies: StateFlow<Loadable<ActorResult>> = _actorMovies.asStateFlow()

    private val _actorProgress = MutableStateFlow(ActorProgress())
    val actorProgress: StateFlow<ActorProgress> = _actorProgress.asStateFlow()

    // Bumped by "update the guide": the channel lists ask for their programmes again.
    private val _epgVersion = MutableStateFlow(0)
    val epgVersion: StateFlow<Int> = _epgVersion.asStateFlow()

    // ------------------------------------------------------------------ search

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _searchChannels = MutableStateFlow<List<Channel>>(emptyList())
    val searchChannels: StateFlow<List<Channel>> = _searchChannels.asStateFlow()

    private val _searchMovies = MutableStateFlow<List<Movie>>(emptyList())
    val searchMovies: StateFlow<List<Movie>> = _searchMovies.asStateFlow()

    private val _searchSeries = MutableStateFlow<List<Series>>(emptyList())
    val searchSeries: StateFlow<List<Series>> = _searchSeries.asStateFlow()

    private val _searchLoading = MutableStateFlow<Set<MediaKind>>(emptySet())
    val searchLoading: StateFlow<Set<MediaKind>> = _searchLoading.asStateFlow()

    private val channelIndex = SearchIndex<Channel> { it.name }
    private val movieIndex = SearchIndex<Movie> { it.name }
    private val seriesIndex = SearchIndex<Series> { it.name }

    private val indexLoaded = HashSet<MediaKind>()
    private val indexLocks = mapOf(
        MediaKind.LIVE to Mutex(),
        MediaKind.MOVIE to Mutex(),
        MediaKind.SERIES to Mutex(),
    )
    private var movieTitleMap: Map<String, List<Pair<Movie, Int?>>>? = null
    private val filmographyCache = HashMap<String, Filmography.Result>()

    private var homeJob: Job? = null
    private var playingEpgJob: Job? = null
    private var searchJob: Job? = null
    private var infoJob: Job? = null
    private var actorJob: Job? = null

    // The list the current live channel was started from: up/down zap inside it.
    private var queue: List<Channel> = emptyList()

    private val epgCache = HashMap<String, Pair<Long, List<EpgEntry>>>()
    private val epgInFlight = HashSet<String>()
    private val epgSemaphore = Semaphore(3)
    private val seriesInfoCache = HashMap<String, SeriesInfo>()

    init {
        _credentials.value?.let { startSession(it) }
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
            _loginError.value = UiError.FillFields
            return
        }

        val credentials = Credentials(server, user.trim(), pass)

        viewModelScope.launch {
            _loginBusy.value = true
            _loginError.value = null

            try {
                XtreamClient.authenticate(credentials)
                credentialStore.save(credentials)
                _credentials.value = credentials
                startSession(credentials)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _loginError.value = toUiError(e)
            } finally {
                _loginBusy.value = false
            }
        }
    }

    fun logout() {
        homeJob?.cancel()
        playingEpgJob?.cancel()
        searchJob?.cancel()
        infoJob?.cancel()
        actorJob?.cancel()
        credentialStore.clear()
        _credentials.value = null
        live.reset()
        movies.reset()
        series.reset()
        _favChannels.value = emptyList()
        _favMovies.value = emptyList()
        _favSeries.value = emptyList()
        _progress.value = emptyList()
        _featured.value = emptyList()
        _latestMovies.value = emptyList()
        _latestSeries.value = emptyList()
        _homeError.value = null
        _playing.value = null
        _playingEpg.value = null
        _stack.value = emptyList()
        _tab.value = Tab.HOME
        _searchQuery.value = ""
        _searchChannels.value = emptyList()
        _searchMovies.value = emptyList()
        _searchSeries.value = emptyList()
        _epgMap.value = emptyMap()
        channelIndex.set(emptyList())
        movieIndex.set(emptyList())
        seriesIndex.set(emptyList())
        indexLoaded.clear()
        movieTitleMap = null
        filmographyCache.clear()
        epgCache.clear()
        seriesInfoCache.clear()
        queue = emptyList()
    }

    private fun startSession(credentials: Credentials) {
        _favChannels.value = favChannelStore.load(credentials)
        _favMovies.value = favMovieStore.load(credentials)
        _favSeries.value = favSeriesStore.load(credentials)
        _progress.value = progressStore.load(credentials)
        _hiddenLive.value = settings.hidden(credentials, MediaKind.LIVE)
        _hiddenMovies.value = settings.hidden(credentials, MediaKind.MOVIE)
        _hiddenSeries.value = settings.hidden(credentials, MediaKind.SERIES)
        live.start(credentials)
        loadHome(credentials)
    }

    // ------------------------------------------------------------------ language

    // The movies and series that are suggested follow the language of the app.
    private fun contentLanguage(): String {
        val chosen = settings.language

        return if (chosen != "system") chosen else Locale.getDefault().language
    }

    // Changing the language reloads what depends on it.
    fun setLanguage(code: String) {
        settings.language = code

        val credentials = _credentials.value ?: return

        movies.reset()
        series.reset()
        _featured.value = emptyList()
        loadHome(credentials)
    }

    // ------------------------------------------------------------------ tabs and screens

    // What each of Live TV, Movies and Series shows (0 favourites, 1 search, 2 a category).
    // It is kept when coming back from a movie page; choosing the tab again starts over
    // with the favourites.
    private val browseModes = HashMap<MediaKind, Int>()

    fun browseMode(kind: MediaKind): Int? = browseModes[kind]

    // The last item opened in each list: coming back, the cursor returns on it.
    private val lastItems = HashMap<MediaKind, String>()

    fun lastItem(kind: MediaKind): String? = lastItems[kind]

    fun rememberBrowseMode(kind: MediaKind, mode: Int) {
        browseModes[kind] = mode
        lastItems.remove(kind)
    }

    private fun forgetBrowsing(kind: MediaKind) {
        browseModes.remove(kind)
        lastItems.remove(kind)
    }

    fun selectTab(tab: Tab) {
        val credentials = _credentials.value

        when (tab) {
            Tab.LIVE -> forgetBrowsing(MediaKind.LIVE)
            Tab.MOVIES -> forgetBrowsing(MediaKind.MOVIE)
            Tab.SERIES -> forgetBrowsing(MediaKind.SERIES)
            else -> Unit
        }

        _tab.value = tab

        if (credentials == null) return

        when (tab) {
            Tab.MOVIES -> if (!movies.started) movies.start(credentials)
            Tab.SERIES -> if (!series.started) series.start(credentials)
            else -> Unit
        }
    }

    private fun push(route: Route) {
        _stack.value = _stack.value + route
    }

    fun back() {
        val current = _stack.value

        if (current.isNotEmpty()) _stack.value = current.dropLast(1)
    }

    private fun replaceTop(route: Route) {
        val current = _stack.value

        _stack.value = if (current.isEmpty()) listOf(route) else current.dropLast(1) + route
    }

    fun openMovie(movie: Movie) {
        lastItems[MediaKind.MOVIE] = movie.id
        push(Route.MovieDetails(movie))
        loadMovieInfo(movie)

        // The movie list is prepared in the background: the page of an actor then opens fast.
        viewModelScope.launch {
            try {
                ensureIndex(MediaKind.MOVIE)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // not needed now
            }
        }
    }

    fun openSeries(series: Series) {
        lastItems[MediaKind.SERIES] = series.id
        push(Route.SeriesDetails(series))
        loadSeriesInfo(series)
    }

    // "Retry" on a series page that failed to load.
    fun openSeriesAgain(series: Series) {
        loadSeriesInfo(series)
    }

    fun openManageCategories(kind: MediaKind) {
        push(Route.ManageCategories(kind))
    }

    // ------------------------------------------------------------------ browsing actions

    fun selectLiveCategory(category: Category) {
        _credentials.value?.let { live.select(it, category) }
    }

    fun selectMovieCategory(category: Category) {
        _credentials.value?.let { movies.select(it, category) }
    }

    fun selectSeriesCategory(category: Category) {
        _credentials.value?.let { series.select(it, category) }
    }

    fun retry(tab: Tab) {
        val credentials = _credentials.value ?: return

        when (tab) {
            Tab.LIVE -> live.retry(credentials)
            Tab.MOVIES -> movies.retry(credentials)
            Tab.SERIES -> series.retry(credentials)
            Tab.HOME -> loadHome(credentials)
            else -> Unit
        }
    }

    fun categoriesOf(kind: MediaKind): StateFlow<List<Category>> =
        when (kind) {
            MediaKind.MOVIE -> movies.categories
            MediaKind.SERIES -> series.categories
            else -> live.categories
        }

    fun hiddenOf(kind: MediaKind): StateFlow<Set<String>> =
        when (kind) {
            MediaKind.MOVIE -> hiddenMovies
            MediaKind.SERIES -> hiddenSeries
            else -> hiddenLive
        }

    // The category lists are loaded when their tab is first opened: the settings
    // screen can need them earlier.
    fun ensureCategories(kind: MediaKind) {
        val credentials = _credentials.value ?: return

        when (kind) {
            MediaKind.MOVIE -> if (!movies.started) movies.start(credentials)
            MediaKind.SERIES -> if (!series.started) series.start(credentials)
            else -> Unit
        }
    }

    fun setCategoriesHidden(kind: MediaKind, ids: Collection<String>, hide: Boolean) {
        val credentials = _credentials.value ?: return
        val flow = when (kind) {
            MediaKind.MOVIE -> _hiddenMovies
            MediaKind.SERIES -> _hiddenSeries
            else -> _hiddenLive
        }
        val updated = if (hide) flow.value + ids else flow.value - ids.toSet()

        flow.value = updated
        settings.setHidden(credentials, kind, updated)
    }

    // ------------------------------------------------------------------ guide

    // Asked by each visible channel row. At most 3 requests at a time.
    fun requestEpg(streamId: String) {
        val credentials = _credentials.value ?: return
        val nowMillis = System.currentTimeMillis()
        val cached = epgCache[streamId]

        if (cached != null && nowMillis - cached.first < 120_000) {
            publishEpg(streamId, cached.second)
            return
        }

        if (!epgInFlight.add(streamId)) return

        viewModelScope.launch {
            try {
                val entries = epgSemaphore.withPermit { XtreamClient.shortEpg(credentials, streamId) }

                epgCache[streamId] = System.currentTimeMillis() to entries
                publishEpg(streamId, entries)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                publishEpg(streamId, emptyList())
            } finally {
                epgInFlight.remove(streamId)
            }
        }
    }

    private fun publishEpg(streamId: String, entries: List<EpgEntry>) {
        val info = EpgInfo.from(entries, System.currentTimeMillis() / 1000)
        var map = _epgMap.value + (streamId to info)

        if (map.size > 600) map = map.entries.toList().takeLast(400).associate { it.key to it.value }

        _epgMap.value = map
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

    // ------------------------------------------------------------------ refresh

    // Lists are downloaded again the next time they are opened (Live TV right away).
    fun refresh(kind: MediaKind) {
        val credentials = _credentials.value ?: return

        indexLoaded.remove(kind)

        when (kind) {
            MediaKind.LIVE -> {
                channelIndex.set(emptyList())
                live.reset()
                live.start(credentials)
            }
            MediaKind.SERIES -> {
                seriesIndex.set(emptyList())
                seriesInfoCache.clear()
                series.reset()
            }
            else -> {
                movieIndex.set(emptyList())
                movieTitleMap = null
                movies.reset()
            }
        }

        if (kind != MediaKind.LIVE) loadHome(credentials)
    }

    fun refreshAll() {
        val credentials = _credentials.value ?: return

        refresh(MediaKind.LIVE)
        refresh(MediaKind.MOVIE)
        refresh(MediaKind.SERIES)
        refreshGuide()
        loadHome(credentials)
    }

    // The programmes of every channel are asked again.
    fun refreshGuide() {
        epgCache.clear()
        epgInFlight.clear()
        _epgMap.value = emptyMap()
        _epgVersion.value = _epgVersion.value + 1
    }

    // ------------------------------------------------------------------ favourites

    fun toggleFavorite(channel: Channel) {
        val credentials = _credentials.value ?: return
        val current = _favChannels.value
        val updated =
            if (current.any { it.id == channel.id }) current.filterNot { it.id == channel.id }
            else listOf(channel) + current

        _favChannels.value = updated
        favChannelStore.save(credentials, updated)
    }

    fun toggleFavorite(movie: Movie) {
        val credentials = _credentials.value ?: return
        val current = _favMovies.value
        val updated =
            if (current.any { it.id == movie.id }) current.filterNot { it.id == movie.id }
            else listOf(movie) + current

        _favMovies.value = updated
        favMovieStore.save(credentials, updated)
    }

    fun toggleFavorite(series: Series) {
        val credentials = _credentials.value ?: return
        val current = _favSeries.value
        val updated =
            if (current.any { it.id == series.id }) current.filterNot { it.id == series.id }
            else listOf(series) + current

        _favSeries.value = updated
        favSeriesStore.save(credentials, updated)
    }

    fun clearProgress() {
        val credentials = _credentials.value ?: return

        _progress.value = emptyList()
        progressStore.save(credentials, emptyList())
    }

    // ------------------------------------------------------------------ live playback

    fun playLive(channel: Channel, list: List<Channel>) {
        lastItems[MediaKind.LIVE] = channel.id
        queue = if (list.any { it.id == channel.id }) list else listOf(channel)
        startLive(channel)
    }

    // Next (+1) or previous (-1) channel of the list the current one came from.
    fun zap(delta: Int) {
        val current = _playing.value ?: return

        if (queue.size < 2) return

        val index = queue.indexOfFirst { it.id == current.id }.coerceAtLeast(0)

        startLive(queue[Math.floorMod(index + delta, queue.size)])
    }

    fun stopLive() {
        playingEpgJob?.cancel()
        _playing.value = null
        _playingEpg.value = null
    }

    private fun startLive(channel: Channel) {
        _playing.value = channel
        _playingEpg.value = null
        playingEpgJob?.cancel()
        playingEpgJob = viewModelScope.launch {
            while (isActive) {
                _playingEpg.value = fetchEpg(channel.id)
                delay(60_000)
            }
        }
    }

    // ------------------------------------------------------------------ details

    private fun loadMovieInfo(movie: Movie) {
        val credentials = _credentials.value ?: return

        infoJob?.cancel()
        _movieInfo.value = Loadable.Loading
        infoJob = viewModelScope.launch {
            try {
                _movieInfo.value = Loadable.Ready(XtreamClient.movieInfo(credentials, movie.id))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _movieInfo.value = Loadable.Failed(toUiError(e))
            }
        }
    }

    private fun loadSeriesInfo(series: Series) {
        val credentials = _credentials.value ?: return

        infoJob?.cancel()
        _seriesInfo.value = Loadable.Loading
        infoJob = viewModelScope.launch {
            try {
                _seriesInfo.value = Loadable.Ready(cachedSeriesInfo(credentials, series.id))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _seriesInfo.value = Loadable.Failed(toUiError(e))
            }
        }
    }

    private suspend fun cachedSeriesInfo(credentials: Credentials, seriesId: String): SeriesInfo {
        seriesInfoCache[seriesId]?.let { return it }

        val info = XtreamClient.seriesInfo(credentials, seriesId)

        seriesInfoCache[seriesId] = info

        return info
    }

    // ------------------------------------------------------------------ movie and episode playback

    fun progressFor(kind: MediaKind, id: String): WatchProgress? {
        val key = WatchProgress.keyOf(kind, id)

        return _progress.value.firstOrNull { it.key == key }
    }

    fun playMovie(movie: Movie, resume: Boolean) {
        val saved = progressFor(MediaKind.MOVIE, movie.id)
        val start = if (resume && saved != null && saved.inProgress) saved.position else 0L

        push(
            Route.PlayVod(
                VodRequest(
                    kind = MediaKind.MOVIE,
                    id = movie.id,
                    title = movie.name,
                    subtitle = null,
                    image = movie.poster,
                    ext = movie.ext,
                    startMs = start,
                    categoryId = movie.categoryId,
                )
            )
        )
    }

    fun playEpisode(series: Series, episode: Episode, resume: Boolean) {
        val saved = progressFor(MediaKind.EPISODE, episode.id)
        val start = if (resume && saved != null && saved.inProgress) saved.position else 0L

        push(Route.PlayVod(episodeRequest(series.id, series.name, series.poster, episode, start)))
    }

    private fun episodeRequest(
        seriesId: String,
        seriesName: String,
        image: String?,
        episode: Episode,
        startMs: Long,
    ) = VodRequest(
        kind = MediaKind.EPISODE,
        id = episode.id,
        title = episode.title,
        subtitle = "$seriesName  \u2022  S${episode.season} E${episode.number}",
        image = episode.image ?: image,
        ext = episode.ext,
        startMs = startMs,
        seriesId = seriesId,
        seriesName = seriesName,
        season = episode.season,
        number = episode.number,
    )

    // "Continue watching" on the home page: back into the picture, where it stopped
    // or from the start.
    fun resume(progress: WatchProgress, fromStart: Boolean = false) {
        push(
            Route.PlayVod(
                VodRequest(
                    kind = progress.kind,
                    id = progress.id,
                    title = progress.title,
                    subtitle = progress.subtitle,
                    image = progress.image,
                    ext = progress.ext,
                    startMs = if (!fromStart && progress.inProgress) progress.position else 0L,
                    seriesId = progress.seriesId,
                    seriesName = progress.seriesName,
                    season = progress.season,
                    number = progress.number,
                )
            )
        )
    }

    fun saveProgress(request: VodRequest, positionMs: Long, durationMs: Long) {
        val credentials = _credentials.value ?: return

        if (durationMs <= 0) return

        val key = WatchProgress.keyOf(request.kind, request.id)
        val entry = WatchProgress(
            key = key,
            kind = request.kind,
            id = request.id,
            title = request.title,
            subtitle = request.subtitle,
            image = request.image,
            ext = request.ext,
            position = positionMs,
            duration = durationMs,
            updatedAt = System.currentTimeMillis(),
            seriesId = request.seriesId,
            seriesName = request.seriesName,
            season = request.season,
            number = request.number,
        )
        val updated = (listOf(entry) + _progress.value.filterNot { it.key == key }).take(150)

        _progress.value = updated
        progressStore.save(credentials, updated)
    }

    // The picture ended (or "next episode" was pressed): the next episode of the
    // series starts, or we go back.
    fun playNext(request: VodRequest) {
        val credentials = _credentials.value
        val seriesId = request.seriesId

        if (credentials == null || seriesId == null) {
            back()
            return
        }

        viewModelScope.launch {
            try {
                val info = cachedSeriesInfo(credentials, seriesId)
                val all = info.seasons.values.flatten().sortedWith(compareBy({ it.season }, { it.number }))
                val index = all.indexOfFirst { it.id == request.id }
                val next = if (index >= 0) all.getOrNull(index + 1) else null

                if (next == null) {
                    back()
                } else {
                    replaceTop(
                        Route.PlayVod(
                            episodeRequest(
                                seriesId,
                                request.seriesName.orEmpty(),
                                request.image,
                                next,
                                0L,
                            )
                        )
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                back()
            }
        }
    }

    // ------------------------------------------------------------------ home

    private fun loadHome(credentials: Credentials) {
        homeJob?.cancel()
        homeJob = viewModelScope.launch {
            _homeLoading.value = true
            _homeError.value = null

            try {
                val tags = tagsFor(contentLanguage())
                val movieCategory = pickLatest(XtreamClient.movieCategories(credentials), _hiddenMovies.value, tags)
                val seriesCategory = pickLatest(XtreamClient.seriesCategories(credentials), _hiddenSeries.value, tags)

                val latestMovies = movieCategory
                    ?.let { XtreamClient.movies(credentials, it.id).sortedByDescending { m -> m.added }.take(24) }
                    .orEmpty()

                _latestMovies.value = latestMovies

                val latestSeries = seriesCategory
                    ?.let { XtreamClient.series(credentials, it.id).sortedByDescending { s -> s.added }.take(24) }
                    .orEmpty()

                _latestSeries.value = latestSeries

                buildFeatured(credentials, latestMovies, latestSeries)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _homeError.value = toUiError(e)
            } finally {
                _homeLoading.value = false
            }
        }
    }

    // Up to 5 highlights, movie and series in turn. Each one appears as soon as
    // its details (plot, big picture) have arrived.
    private suspend fun buildFeatured(
        credentials: Credentials,
        latestMovies: List<Movie>,
        latestSeries: List<Series>,
    ) {
        val movieQueue = latestMovies.filter { it.poster != null }.take(3)
        val seriesQueue = latestSeries.filter { it.poster != null }.take(2)
        val slides = ArrayList<Featured>()

        for (index in 0 until maxOf(movieQueue.size, seriesQueue.size)) {
            val movie = movieQueue.getOrNull(index)
            val serie = seriesQueue.getOrNull(index)

            if (movie != null) {
                try {
                    val info = XtreamClient.movieInfo(credentials, movie.id)

                    slides.add(
                        Featured(
                            kind = MediaKind.MOVIE,
                            movie = movie,
                            series = null,
                            title = movie.name,
                            backdrop = info.backdrop ?: movie.poster,
                            meta = metaOf(info, movie.rating),
                            plot = info.plot,
                        )
                    )
                    _featured.value = slides.toList()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    // this one is skipped
                }
            }

            if (serie != null) {
                try {
                    val info = cachedSeriesInfo(credentials, serie.id).info

                    slides.add(
                        Featured(
                            kind = MediaKind.SERIES,
                            movie = null,
                            series = serie,
                            title = serie.name,
                            backdrop = info.backdrop ?: serie.poster,
                            meta = metaOf(info, serie.rating),
                            plot = info.plot,
                        )
                    )
                    _featured.value = slides.toList()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    // this one is skipped
                }
            }
        }
    }

    // ------------------------------------------------------------------ search

    // The search opens inside Live TV, Movies or Series and only looks in that one.
    fun beginSearch(kind: MediaKind) {
        _searchQuery.value = ""
        _searchChannels.value = emptyList()
        _searchMovies.value = emptyList()
        _searchSeries.value = emptyList()
        viewModelScope.launch {
            try {
                ensureIndex(kind)
                runSearch(kind, _searchQuery.value)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // the search stays empty
            }
        }
    }

    fun setSearchQuery(kind: MediaKind, text: String) {
        _searchQuery.value = text
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(250)
            runSearch(kind, text)
        }
    }

    // The list of one type is downloaded once (the movies are the biggest).
    private suspend fun ensureIndex(kind: MediaKind) {
        val credentials = _credentials.value ?: return
        val lock = indexLocks.getValue(kind)

        lock.withLock {
            if (kind in indexLoaded) return

            _searchLoading.value = _searchLoading.value + kind

            try {
                when (kind) {
                    MediaKind.LIVE -> {
                        val list = XtreamClient.allLiveChannels(credentials)

                        withContext(Dispatchers.Default) { channelIndex.set(list) }
                    }
                    MediaKind.SERIES -> {
                        val list = XtreamClient.allSeries(credentials)

                        withContext(Dispatchers.Default) { seriesIndex.set(list) }
                    }
                    else -> {
                        val list = XtreamClient.allMovies(credentials)

                        withContext(Dispatchers.Default) { movieIndex.set(list) }
                    }
                }

                indexLoaded.add(kind)
            } finally {
                _searchLoading.value = _searchLoading.value - kind
            }
        }
    }

    private suspend fun runSearch(kind: MediaKind, text: String) {
        val query = normalizeText(text).trim()

        if (query.length < 2) {
            _searchChannels.value = emptyList()
            _searchMovies.value = emptyList()
            _searchSeries.value = emptyList()
            return
        }

        when (kind) {
            MediaKind.LIVE -> {
                _searchChannels.value = withContext(Dispatchers.Default) { channelIndex.search(query, 120) }
            }
            MediaKind.SERIES -> {
                _searchSeries.value = withContext(Dispatchers.Default) { seriesIndex.search(query, 120) }
            }
            else -> {
                _searchMovies.value = withContext(Dispatchers.Default) { movieIndex.search(query, 120) }
            }
        }
    }

    // ------------------------------------------------------------------ actors

    // The film list of the actor and the movie catalogue are loaded at the same time.
    fun openActor(name: String) {
        push(Route.Actor(name))
        actorJob?.cancel()
        _actorMovies.value = Loadable.Loading
        _actorProgress.value = ActorProgress()
        actorJob = viewModelScope.launch {
            try {
                coroutineScope {
                    val catalogue = async {
                        try {
                            ensureIndex(MediaKind.MOVIE)
                            _actorProgress.value = _actorProgress.value.copy(
                                catalogue = StepState.DONE,
                                catalogueSize = movieIndex.size,
                            )
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            _actorProgress.value = _actorProgress.value.copy(catalogue = StepState.FAILED)
                            throw e
                        }
                    }

                    val result = filmographyCache[name] ?: try {
                        Filmography.fetch(name).also { filmographyCache[name] = it }
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        _actorProgress.value = _actorProgress.value.copy(lookup = StepState.FAILED)
                        throw e
                    }

                    _actorProgress.value = _actorProgress.value.copy(
                        lookup = StepState.DONE,
                        filmCount = result.films.size,
                    )

                    catalogue.await()
                    _actorProgress.value = _actorProgress.value.copy(matching = StepState.RUNNING)

                    val matches = withContext(Dispatchers.Default) { matchFilms(result.films) }

                    _actorProgress.value = _actorProgress.value.copy(matching = StepState.DONE)
                    _actorMovies.value = Loadable.Ready(ActorResult(matches, result.actorFound, result.films.size))
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _actorMovies.value = Loadable.Failed(toUiError(e))
            }
        }
    }

    // The movies of the catalogue whose title is one of the actor's films
    // (French, English or original title; the year, when both are known, within one).
    private fun matchFilms(films: List<Filmography.Film>): List<Movie> {
        val map = movieTitleMap ?: movieIndex.items()
            .groupBy { Filmography.titleKey(it.name).first }
            .mapValues { entry -> entry.value.map { movie -> movie to Filmography.titleKey(movie.name).second } }
            .also { movieTitleMap = it }
        val found = LinkedHashMap<String, Movie>()

        for (film in films) {
            for (title in film.titles) {
                val key = Filmography.titleKey(title).first

                if (key.length < 3) continue

                for ((movie, year) in map[key].orEmpty()) {
                    val filmYear = film.year

                    if (filmYear != null && year != null && abs(filmYear - year) > 1) continue

                    found[movie.id] = movie
                }
            }
        }

        return found.values.sortedBy { it.name }
    }
}
