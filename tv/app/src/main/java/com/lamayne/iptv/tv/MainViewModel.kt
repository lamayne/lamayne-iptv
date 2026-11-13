package com.lamayne.iptv.tv

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lamayne.iptv.tv.data.BrowseController
import coil.imageLoader
import coil.request.ImageRequest
import coil.request.SuccessResult
import com.lamayne.iptv.tv.data.AccountInfo
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
import com.lamayne.iptv.tv.data.M3U_USER
import com.lamayne.iptv.tv.data.M3uClient
import com.lamayne.iptv.tv.data.MediaInfo
import com.lamayne.iptv.tv.data.PlotLanguage
import com.lamayne.iptv.tv.data.isM3u
import com.lamayne.iptv.tv.ui.channelName
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
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
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
import java.util.Calendar
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

// Why a title is shown under "Similar".
enum class SimilarReason { GENRE, DIRECTOR, CAST, CATEGORY }

data class SimilarMovie(val movie: Movie, val reason: SimilarReason)

data class SimilarShow(val series: Series, val reason: SimilarReason)

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

// The languages a provider tags its categories with ("|FR| ...", "EN| ..."), and the tags of each.
private val LANGUAGES: Map<String, Set<String>> = linkedMapOf(
    "fr" to setOf("FR", "FRA"),
    "en" to setOf("EN", "US", "UK", "GB", "ENG", "USA"),
    "es" to setOf("ES", "SP", "ESP", "LAT"),
    "de" to setOf("DE", "GER", "DEU"),
    "it" to setOf("IT", "ITA"),
    "pt" to setOf("PT", "BR", "POR"),
    "ar" to setOf("AR", "ARA"),
    "nl" to setOf("NL", "DUT"),
    "tr" to setOf("TR", "TUR"),
    "pl" to setOf("PL", "POL"),
    "ru" to setOf("RU", "RUS"),
)

private fun tagsFor(language: String): Set<String> = LANGUAGES[language] ?: LANGUAGES.getValue("en")

private fun languageOfTag(tag: String): String? =
    LANGUAGES.entries.firstOrNull { tag in it.value }?.key

private fun pickLatest(categories: List<Category>, hidden: Set<String>, tags: Set<String>): Category? {
    val visible = categories.filter { it.id !in hidden }
    val inLanguage = visible.filter { categoryTag(it.name) in tags }
    val pool = if (inLanguage.isNotEmpty()) inLanguage else visible

    return pool.firstOrNull { category ->
        val name = normalizeText(category.name)

        LATEST_WORDS.any { name.contains(it) }
    } ?: pool.firstOrNull()
}

// The "latest" row of the home page: what CAME OUT recently comes first. A title whose year
// is known and old (a 2018 film put in a "new" category) is left out; the others are sorted
// by the date they were added.
private fun recentMovies(items: List<Movie>): List<Movie> {
    val thisYear = Calendar.getInstance().get(Calendar.YEAR)

    return items
        .filter { !it.poster.isNullOrBlank() && (it.year ?: thisYear) >= thisYear - 2 }
        .sortedWith(
            compareByDescending<Movie> { (it.year ?: 0) >= thisYear - 1 }
                .thenByDescending { it.added }
        )
        .take(24)
}

private fun recentSeries(items: List<Series>): List<Series> {
    val thisYear = Calendar.getInstance().get(Calendar.YEAR)

    return items
        .filter { !it.poster.isNullOrBlank() && (it.year ?: thisYear) >= thisYear - 2 }
        .sortedWith(
            compareByDescending<Series> { (it.year ?: 0) >= thisYear - 1 }
                .thenByDescending { it.added }
        )
        .take(24)
}

// The home page is rebuilt at every launch, and again when it is opened more than 6 hours
// after the last time (or with "Update all").
private const val HOME_REFRESH_MS = 6 * 60 * 60 * 1000L

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
    private val recentChannelStore = JsonListStore(application, "recent_", 30, ::channelToJson, ::channelFromJson)
    private val recentMovieStore = JsonListStore(application, "recentm_", 30, ::movieToJson, ::movieFromJson)
    private val recentSeriesStore = JsonListStore(application, "recents_", 30, ::seriesToJson, ::seriesFromJson)
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
        { c -> if (c.isM3u) M3uClient.categories(c) else XtreamClient.liveCategories(c) },
        { c, id -> if (c.isM3u) M3uClient.channels(c, id) else XtreamClient.liveChannels(c, id) },
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

    // The language of the home recommendations ("auto" = the language of the app).
    private val _homeLanguage = MutableStateFlow(settings.homeLanguage)
    val homeLanguage: StateFlow<String> = _homeLanguage.asStateFlow()

    // The languages really present in the categories (the ones hidden by the user do not count).
    val availableHomeLanguages: StateFlow<List<String>> =
        combine(movies.categories, series.categories, _hiddenMovies, _hiddenSeries) { movieList, seriesList, hiddenMovies, hiddenSeries ->
            val found = HashSet<String>()

            for (category in movieList) {
                if (category.id !in hiddenMovies) categoryTag(category.name)?.let { tag -> languageOfTag(tag)?.let { found.add(it) } }
            }

            for (category in seriesList) {
                if (category.id !in hiddenSeries) categoryTag(category.name)?.let { tag -> languageOfTag(tag)?.let { found.add(it) } }
            }

            LANGUAGES.keys.filter { it in found }
        }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    // ------------------------------------------------------------------ favourites, history

    private val _favChannels = MutableStateFlow<List<Channel>>(emptyList())
    val favChannels: StateFlow<List<Channel>> = _favChannels.asStateFlow()

    private val _favMovies = MutableStateFlow<List<Movie>>(emptyList())
    val favMovies: StateFlow<List<Movie>> = _favMovies.asStateFlow()

    private val _favSeries = MutableStateFlow<List<Series>>(emptyList())
    val favSeries: StateFlow<List<Series>> = _favSeries.asStateFlow()

    // What was watched last, for the "Recently watched" entry of Live TV, Movies and Series.
    private val _recentChannels = MutableStateFlow<List<Channel>>(emptyList())
    val recentChannels: StateFlow<List<Channel>> = _recentChannels.asStateFlow()

    private val _recentMovies = MutableStateFlow<List<Movie>>(emptyList())
    val recentMovies: StateFlow<List<Movie>> = _recentMovies.asStateFlow()

    private val _recentSeries = MutableStateFlow<List<Series>>(emptyList())
    val recentSeries: StateFlow<List<Series>> = _recentSeries.asStateFlow()

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
    // A short message at the bottom of the screen ("Added to favourites").
    data class Notice(val name: String, val added: Boolean, val id: Long)

    private val _notice = MutableStateFlow<Notice?>(null)
    val notice: StateFlow<Notice?> = _notice.asStateFlow()
    private var noticeJob: Job? = null

    private fun announce(name: String, added: Boolean) {
        val current = Notice(name, added, System.nanoTime())

        _notice.value = current
        noticeJob?.cancel()
        noticeJob = viewModelScope.launch {
            delay(2_200)

            if (_notice.value?.id == current.id) _notice.value = null
        }
    }

    private val _accountInfo = MutableStateFlow<AccountInfo?>(null)
    val accountInfo: StateFlow<AccountInfo?> = _accountInfo.asStateFlow()

    // The subscription (days left...) is asked when the account block of Settings is shown.
    fun loadAccountInfo() {
        val credentials = _credentials.value ?: return

        if (credentials.isM3u) {
            _accountInfo.value = null
            return
        }

        viewModelScope.launch {
            try {
                _accountInfo.value = XtreamClient.accountInfo(credentials)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // the previous answer stays
            }
        }
    }

    private val _favNewestFirst = MutableStateFlow(settings.favNewestFirst)
    val favNewestFirst: StateFlow<Boolean> = _favNewestFirst.asStateFlow()

    fun toggleFavoritesOrder() {
        val next = !_favNewestFirst.value

        _favNewestFirst.value = next
        settings.favNewestFirst = next
    }

    private val _aspect = MutableStateFlow(settings.aspect)
    val aspect: StateFlow<Int> = _aspect.asStateFlow()

    // Fit -> zoom -> stretch -> fit...
    fun cycleAspect() {
        val next = (_aspect.value + 1) % 3

        _aspect.value = next
        settings.aspect = next
    }

    private val _tunneling = MutableStateFlow(settings.tunneling)
    val tunneling: StateFlow<Boolean> = _tunneling.asStateFlow()

    fun toggleTunneling() {
        val next = !_tunneling.value

        _tunneling.value = next
        settings.tunneling = next
    }

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
    private var siblingMap: Map<String, List<String>>? = null
    private var siblingJob: Job? = null
    private val filmographyCache = HashMap<String, Filmography.Result>()

    private var homeJob: Job? = null
    private var lastHomeLoad = 0L
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

    fun login(serverRaw: String, user: String, pass: String) {
        val server = XtreamClient.normalizeServer(serverRaw)

        if (server.isEmpty() || user.isBlank() || pass.isBlank()) {
            _loginError.value = UiError.FillFields
            return
        }

        // Without "http://" or "https://" typed, the secure address is tried first and the plain
        // one only if the server does not speak https.
        val typed = serverRaw.trim()
        val explicit = typed.startsWith("http://", ignoreCase = true) || typed.startsWith("https://", ignoreCase = true)
        val candidates = if (explicit) listOf(server) else listOf("https://" + server.removePrefix("http://"), server)

        viewModelScope.launch {
            _loginBusy.value = true
            _loginError.value = null

            try {
                var failure: Exception? = null

                for (candidate in candidates) {
                    val credentials = Credentials(candidate, user.trim(), pass)

                    try {
                        XtreamClient.authenticate(credentials)
                        credentialStore.save(credentials)
                        _credentials.value = credentials
                        startSession(credentials)
                        return@launch
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: XtreamClient.AuthException) {
                        // the server answered: wrong user or password, no need to try the other address
                        failure = e
                        break
                    } catch (e: Exception) {
                        failure = e
                    }
                }

                failure?.let { _loginError.value = toUiError(it) }
            } finally {
                _loginBusy.value = false
            }
        }
    }

    // A link from the provider. When it carries the account of an Xtream server
    // (get.php?username=...&password=...), the account is used as such; otherwise it
    // is a plain playlist: Live TV only.
    fun loginM3u(raw: String) {
        val url = raw.trim()

        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            _loginError.value = UiError.InvalidAddress
            return
        }

        val uri = Uri.parse(url)
        val user = uri.getQueryParameter("username")
        val pass = uri.getQueryParameter("password")
        val host = uri.host

        if (user != null && pass != null && host != null) {
            val port = if (uri.port != -1) ":${uri.port}" else ""

            login("${uri.scheme}://$host$port", user, pass)
            return
        }

        val credentials = Credentials(url, M3U_USER, "")

        viewModelScope.launch {
            _loginBusy.value = true
            _loginError.value = null

            try {
                M3uClient.load(url, force = true)
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
        _recentChannels.value = emptyList()
        _recentMovies.value = emptyList()
        _recentSeries.value = emptyList()
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
        siblingMap = null
        M3uClient.reset()
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
        _recentChannels.value = recentChannelStore.load(credentials)
        _recentMovies.value = recentMovieStore.load(credentials)
        _recentSeries.value = recentSeriesStore.load(credentials)
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

    private fun homeLanguageCode(): String =
        settings.homeLanguage.takeIf { it != "auto" } ?: contentLanguage()

    fun setHomeLanguage(code: String) {
        settings.homeLanguage = code
        _homeLanguage.value = code

        val credentials = _credentials.value ?: return

        _featured.value = emptyList()
        loadHome(credentials)
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
            Tab.HOME -> if (System.currentTimeMillis() - lastHomeLoad > HOME_REFRESH_MS) loadHome(credentials)
            else -> Unit
        }
    }

    private fun push(route: Route) {
        _stack.value = _stack.value + route
    }

    fun back() {
        val current = _stack.value

        if (current.isEmpty()) return

        val next = current.dropLast(1)

        _stack.value = next

        // The page underneath (a film opened from a similar title, then Back) gets its own
        // information back; nothing is loaded again when it is already the one shown.
        when (val top = next.lastOrNull()) {
            is Route.MovieDetails -> if (top.movie.id != shownMovieId) loadMovieInfo(top.movie)
            is Route.SeriesDetails -> if (top.series.id != shownSeriesId) loadSeriesInfo(top.series)
            else -> Unit
        }
    }

    private fun replaceTop(route: Route) {
        val current = _stack.value

        _stack.value = if (current.isEmpty()) listOf(route) else current.dropLast(1) + route
    }

    fun openMovie(movie: Movie) {
        lastItems[MediaKind.MOVIE] = movie.id
        push(Route.MovieDetails(movie))
        loadMovieInfo(movie)

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
    fun requestEpg(channel: Channel) {
        val credentials = _credentials.value ?: return

        if (credentials.isM3u) return

        val streamId = channel.id
        val nowMillis = System.currentTimeMillis()
        val cached = epgCache[streamId]

        if (cached != null && nowMillis - cached.first < 120_000) {
            publishEpg(streamId, cached.second)
            return
        }

        if (!epgInFlight.add(streamId)) return

        viewModelScope.launch {
            try {
                val entries = loadEntries(credentials, channel)

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

    // The same channel often exists in several categories (France Premium, France FHD...)
    // and the provider only has the guide for some of them: when this one has none, the
    // guide of the channel with the same name is used. The list of names is built once, in
    // the background, and is light (name and number only).
    private suspend fun loadEntries(credentials: Credentials, channel: Channel): List<EpgEntry> {
        val own = epgSemaphore.withPermit { XtreamClient.shortEpg(credentials, channel.id) }

        if (own.isNotEmpty()) return own

        val key = channelKey(channel.name)

        if (key.length < 2) return own

        val map = siblingMap

        if (map == null) {
            loadSiblings(credentials)
            return own
        }

        for (id in map[key].orEmpty().filter { it != channel.id }.take(5)) {
            val entries = try {
                epgSemaphore.withPermit { XtreamClient.shortEpg(credentials, id) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emptyList()
            }

            if (entries.isNotEmpty()) return entries
        }

        return own
    }

    private fun loadSiblings(credentials: Credentials) {
        if (siblingJob?.isActive == true) return

        siblingJob = viewModelScope.launch {
            try {
                val pairs = XtreamClient.liveNames(credentials)

                siblingMap = withContext(Dispatchers.Default) {
                    pairs.groupBy({ channelKey(it.first) }, { it.second })
                }

                // The channels that had no guide are asked again, with this new help.
                epgCache.entries.removeAll { it.value.second.isEmpty() }
                _epgVersion.value = _epgVersion.value + 1
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                siblingMap = emptyMap()
            } catch (e: OutOfMemoryError) {
                siblingMap = emptyMap()
            }
        }
    }

    // "|FR| TF1 FHD" and "TF1" give the same key.
    private fun channelKey(name: String): String =
        normalizeText(channelName(name)).filter { it.isLetterOrDigit() }

    private fun publishEpg(streamId: String, entries: List<EpgEntry>) {
        val info = EpgInfo.from(entries, System.currentTimeMillis() / 1000)
        var map = _epgMap.value + (streamId to info)

        if (map.size > 600) map = map.entries.toList().takeLast(400).associate { it.key to it.value }

        _epgMap.value = map
    }

    private suspend fun fetchEpg(channel: Channel): EpgInfo {
        val credentials = _credentials.value ?: return EpgInfo.EMPTY

        if (credentials.isM3u) return EpgInfo.EMPTY

        val nowMillis = System.currentTimeMillis()
        val cached = epgCache[channel.id]

        if (cached != null && nowMillis - cached.first < 120_000) {
            return EpgInfo.from(cached.second, nowMillis / 1000)
        }

        return try {
            val entries = loadEntries(credentials, channel)

            epgCache[channel.id] = nowMillis to entries
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
                M3uClient.reset()
                siblingMap = null
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
        announce(channelName(channel.name), updated.any { it.id == channel.id })
    }

    fun toggleFavorite(movie: Movie) {
        val credentials = _credentials.value ?: return
        val current = _favMovies.value
        val updated =
            if (current.any { it.id == movie.id }) current.filterNot { it.id == movie.id }
            else listOf(movie) + current

        _favMovies.value = updated
        favMovieStore.save(credentials, updated)
        announce(movie.name, updated.any { it.id == movie.id })
    }

    fun toggleFavorite(series: Series) {
        val credentials = _credentials.value ?: return
        val current = _favSeries.value
        val updated =
            if (current.any { it.id == series.id }) current.filterNot { it.id == series.id }
            else listOf(series) + current

        _favSeries.value = updated
        favSeriesStore.save(credentials, updated)
        announce(series.name, updated.any { it.id == series.id })
    }

    private fun rememberRecent(channel: Channel) {
        val credentials = _credentials.value ?: return
        val updated = (listOf(channel) + _recentChannels.value.filterNot { it.id == channel.id }).take(30)

        _recentChannels.value = updated
        recentChannelStore.save(credentials, updated)
    }

    private fun rememberRecent(movie: Movie) {
        val credentials = _credentials.value ?: return
        val updated = (listOf(movie) + _recentMovies.value.filterNot { it.id == movie.id }).take(30)

        _recentMovies.value = updated
        recentMovieStore.save(credentials, updated)
    }

    private fun rememberRecent(series: Series) {
        val credentials = _credentials.value ?: return
        val updated = (listOf(series) + _recentSeries.value.filterNot { it.id == series.id }).take(30)

        _recentSeries.value = updated
        recentSeriesStore.save(credentials, updated)
    }

    fun clearProgress() {
        val credentials = _credentials.value ?: return

        _progress.value = emptyList()
        progressStore.save(credentials, emptyList())
        _recentChannels.value = emptyList()
        _recentMovies.value = emptyList()
        _recentSeries.value = emptyList()
        recentChannelStore.save(credentials, emptyList())
        recentMovieStore.save(credentials, emptyList())
        recentSeriesStore.save(credentials, emptyList())
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
        rememberRecent(channel)
        _playing.value = channel
        _playingEpg.value = null
        playingEpgJob?.cancel()
        playingEpgJob = viewModelScope.launch {
            // What the list already knew is shown at once; the rest waits for the picture to start.
            epgCache[channel.id]?.let { _playingEpg.value = EpgInfo.from(it.second, System.currentTimeMillis() / 1000) }
            delay(2_500)

            while (isActive) {
                _playingEpg.value = fetchEpg(channel)
                delay(60_000)
            }
        }
    }

    // ------------------------------------------------------------------ details

    private var shownMovieId: String? = null
    private var shownSeriesId: String? = null
    private val movieInfoCache = HashMap<String, MediaInfo>()
    private val infoSemaphore = Semaphore(3)

    private fun loadMovieInfo(movie: Movie) {
        val credentials = _credentials.value ?: return

        shownMovieId = movie.id
        infoJob?.cancel()

        val cached = movieInfoCache[movie.id]

        if (cached != null) {
            _movieInfo.value = Loadable.Ready(cached)
            loadSimilarMovies(movie, cached)
            return
        }

        _movieInfo.value = Loadable.Loading
        infoJob = viewModelScope.launch {
            try {
                val info = XtreamClient.movieInfo(credentials, movie.id)

                movieInfoCache[movie.id] = info
                _movieInfo.value = Loadable.Ready(info)
                loadSimilarMovies(movie, info)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _movieInfo.value = Loadable.Failed(toUiError(e))
            }
        }
    }

    private fun loadSeriesInfo(series: Series) {
        val credentials = _credentials.value ?: return

        shownSeriesId = series.id
        infoJob?.cancel()
        _seriesInfo.value = Loadable.Loading
        infoJob = viewModelScope.launch {
            try {
                val loaded = cachedSeriesInfo(credentials, series.id)

                _seriesInfo.value = Loadable.Ready(loaded)
                loadSimilarSeries(series, loaded.info)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _seriesInfo.value = Loadable.Failed(toUiError(e))
            }
        }
    }

    // ------------------------------------------------------------------ similar titles

    private val _similarMovies = MutableStateFlow<List<SimilarMovie>>(emptyList())
    val similarMovies: StateFlow<List<SimilarMovie>> = _similarMovies.asStateFlow()

    private val _similarShows = MutableStateFlow<List<SimilarShow>>(emptyList())
    val similarShows: StateFlow<List<SimilarShow>> = _similarShows.asStateFlow()

    private val _similarLoading = MutableStateFlow(false)
    val similarLoading: StateFlow<Boolean> = _similarLoading.asStateFlow()

    private var similarJob: Job? = null

    private fun names(text: String?): Set<String> =
        text.orEmpty()
            .split(',', ';', '/', '|')
            .map { it.trim().lowercase(Locale.ROOT) }
            .filter { it.isNotEmpty() }
            .toSet()

    // Same scoring as the Windows app: shared genres first, then director, then cast; being in
    // the same category counts a little.
    private fun scoreOf(wanted: MediaInfo, other: MediaInfo): Pair<Int, SimilarReason> {
        val genres = names(wanted.genre).intersect(names(other.genre)).size
        val directors = names(wanted.director).intersect(names(other.director)).size
        val cast = names(wanted.cast).intersect(names(other.cast)).size
        var score = 5
        var reason = SimilarReason.CATEGORY

        if (genres > 0) {
            score += genres * 100
            reason = SimilarReason.GENRE
        }

        if (directors > 0) {
            score += 80

            if (reason == SimilarReason.CATEGORY) reason = SimilarReason.DIRECTOR
        }

        if (cast > 0) {
            score += minOf(cast, 4) * 20

            if (reason == SimilarReason.CATEGORY) reason = SimilarReason.CAST
        }

        return score to reason
    }

    private fun yearGap(year: Int?, base: Int?): Int =
        if (year == null || base == null) 50 else abs(year - base)

    private suspend fun movieInfoOf(credentials: Credentials, id: String): MediaInfo? {
        movieInfoCache[id]?.let { return it }

        return try {
            infoSemaphore.withPermit { XtreamClient.movieInfo(credentials, id) }.also { movieInfoCache[id] = it }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
    }

    // First the titles of the same category (closest year, best rated), shown at once; then the
    // closest ones are looked at in detail and put in order by what they share with this title.
    private fun loadSimilarMovies(movie: Movie, info: MediaInfo) {
        val credentials = _credentials.value ?: return
        val categoryId = movie.categoryId ?: return

        similarJob?.cancel()
        _similarMovies.value = emptyList()
        _similarShows.value = emptyList()
        _similarLoading.value = true
        similarJob = viewModelScope.launch {
            try {
                val baseYear = info.year?.take(4)?.toIntOrNull() ?: movie.year
                val pool = XtreamClient.movies(credentials, categoryId)
                    .filter { it.id != movie.id && !it.poster.isNullOrBlank() }
                val ordered = pool.sortedWith(
                    compareBy<Movie> { yearGap(it.year, baseYear) }
                        .thenByDescending { it.rating?.toDoubleOrNull() ?: 0.0 }
                )

                _similarMovies.value = ordered.take(12).map { SimilarMovie(it, SimilarReason.CATEGORY) }
                _similarLoading.value = false

                if (names(info.genre).isEmpty() && names(info.director).isEmpty() && names(info.cast).isEmpty()) {
                    return@launch
                }

                val scored = coroutineScope {
                    ordered.take(18)
                        .map { candidate ->
                            async { movieInfoOf(credentials, candidate.id)?.let { other -> candidate to scoreOf(info, other) } }
                        }
                        .awaitAll()
                }.filterNotNull()

                if (scored.isEmpty()) return@launch

                val best = scored.sortedByDescending { it.second.first }.take(12)
                val rest = ordered.filter { item -> best.none { it.first.id == item.id } }

                _similarMovies.value =
                    (best.map { SimilarMovie(it.first, it.second.second) } +
                        rest.map { SimilarMovie(it, SimilarReason.CATEGORY) }).take(12)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // no similar titles shown
            } finally {
                _similarLoading.value = false
            }
        }
    }

    private fun loadSimilarSeries(series: Series, info: MediaInfo) {
        val credentials = _credentials.value ?: return
        val categoryId = series.categoryId ?: return

        similarJob?.cancel()
        _similarMovies.value = emptyList()
        _similarShows.value = emptyList()
        _similarLoading.value = true
        similarJob = viewModelScope.launch {
            try {
                val baseYear = info.year?.take(4)?.toIntOrNull() ?: series.year
                val pool = XtreamClient.series(credentials, categoryId)
                    .filter { it.id != series.id && !it.poster.isNullOrBlank() }
                val ordered = pool.sortedWith(
                    compareBy<Series> { yearGap(it.year, baseYear) }
                        .thenByDescending { it.rating?.toDoubleOrNull() ?: 0.0 }
                )

                _similarShows.value = ordered.take(12).map { SimilarShow(it, SimilarReason.CATEGORY) }
                _similarLoading.value = false

                if (names(info.genre).isEmpty() && names(info.director).isEmpty() && names(info.cast).isEmpty()) {
                    return@launch
                }

                // a series page is heavy (all its episodes): fewer are looked at
                val scored = coroutineScope {
                    ordered.take(8)
                        .map { candidate ->
                            async {
                                try {
                                    val other = infoSemaphore.withPermit { cachedSeriesInfo(credentials, candidate.id).info }

                                    candidate to scoreOf(info, other)
                                } catch (e: CancellationException) {
                                    throw e
                                } catch (e: Exception) {
                                    null
                                }
                            }
                        }
                        .awaitAll()
                }.filterNotNull()

                if (scored.isEmpty()) return@launch

                val best = scored.sortedByDescending { it.second.first }.take(12)
                val rest = ordered.filter { item -> best.none { it.first.id == item.id } }

                _similarShows.value =
                    (best.map { SimilarShow(it.first, it.second.second) } +
                        rest.map { SimilarShow(it, SimilarReason.CATEGORY) }).take(12)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // no similar titles shown
            } finally {
                _similarLoading.value = false
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
        rememberRecent(movie)
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
        rememberRecent(series)
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
        // The same history as when it was started from a list.
        if (progress.kind == MediaKind.MOVIE) {
            rememberRecent(Movie(progress.id, progress.title, progress.image, null, progress.ext, null, 0L))
        } else {
            val seriesId = progress.seriesId

            if (seriesId != null) {
                rememberRecent(Series(seriesId, progress.seriesName ?: progress.title, progress.image, null, null, 0L))
            }
        }

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
        // A plain playlist has no movies or series: nothing to suggest.
        if (credentials.isM3u) return

        lastHomeLoad = System.currentTimeMillis()

        homeJob?.cancel()
        homeJob = viewModelScope.launch {
            _homeLoading.value = true
            _homeError.value = null

            try {
                val target = homeLanguageCode()
                // "Auto" falls back to what exists; a language chosen by hand never does.
                val strict = settings.homeLanguage != "auto"

                val movieCategories = XtreamClient.movieCategories(credentials)
                val seriesCategories = XtreamClient.seriesCategories(credentials)

                homeMovieCategories = movieCategories
                homeSeriesCategories = seriesCategories
                val movieCategory = chooseMovieCategory(credentials, movieCategories, _hiddenMovies.value, target, strict)
                val seriesCategory = chooseSeriesCategory(credentials, seriesCategories, _hiddenSeries.value, target, strict)

                val latestMovies = movieCategory
                    ?.let { recentMovies(XtreamClient.movies(credentials, it.id)) }
                    .orEmpty()
                    .let { list -> keepLoadedPosters(list, { it.poster }, 20) }

                _latestMovies.value = latestMovies

                val latestSeries = seriesCategory
                    ?.let { recentSeries(XtreamClient.series(credentials, it.id)) }
                    .orEmpty()
                    .let { list -> keepLoadedPosters(list, { it.poster }, 20) }

                _latestSeries.value = latestSeries

                buildFeatured(credentials, latestMovies, latestSeries, target, strict)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _homeError.value = toUiError(e)
            } finally {
                _homeLoading.value = false
            }
        }
    }

    // ---- which category is "the latest ones" in the chosen language

    private val categoryLanguageCache = HashMap<String, String>()
    private var homeMovieCategories: List<Category> = emptyList()
    private var homeSeriesCategories: List<Category> = emptyList()

    private fun latestScore(name: String): Int {
        val text = normalizeText(name)

        return if (LATEST_WORDS.any { text.contains(it) }) 1 else 0
    }

    // 1. a category tagged with the language ("|EN| NEW RELEASES") is taken;
    // 2. otherwise the synopses of a few titles of each category tell its language;
    // 3. none found: "auto" takes the first category, a language chosen by hand shows nothing.
    private suspend fun chooseMovieCategory(
        credentials: Credentials,
        categories: List<Category>,
        hidden: Set<String>,
        target: String,
        strict: Boolean,
    ): Category? {
        val visible = categories.filter { it.id !in hidden }
        val tags = tagsFor(target)

        visible.filter { categoryTag(it.name) in tags }.maxByOrNull { latestScore(it.name) }?.let { return it }

        val untagged = visible
            .filter { categoryTag(it.name)?.let { tag -> languageOfTag(tag) } == null }
            .sortedByDescending { latestScore(it.name) }
            .take(8)
        val sampled = coroutineScope {
            untagged.map { category -> async { category to sampleMovieLanguage(credentials, category.id) } }.awaitAll()
        }

        sampled.firstOrNull { it.second == target }?.let { return it.first }

        return if (strict) null else untagged.firstOrNull() ?: visible.firstOrNull()
    }

    private suspend fun chooseSeriesCategory(
        credentials: Credentials,
        categories: List<Category>,
        hidden: Set<String>,
        target: String,
        strict: Boolean,
    ): Category? {
        val visible = categories.filter { it.id !in hidden }
        val tags = tagsFor(target)

        visible.filter { categoryTag(it.name) in tags }.maxByOrNull { latestScore(it.name) }?.let { return it }

        val untagged = visible
            .filter { categoryTag(it.name)?.let { tag -> languageOfTag(tag) } == null }
            .sortedByDescending { latestScore(it.name) }
            .take(8)
        val sampled = coroutineScope {
            untagged.map { category -> async { category to sampleSeriesLanguage(credentials, category.id) } }.awaitAll()
        }

        sampled.firstOrNull { it.second == target }?.let { return it.first }

        return if (strict) null else untagged.firstOrNull() ?: visible.firstOrNull()
    }

    private suspend fun sampleMovieLanguage(credentials: Credentials, categoryId: String): String? {
        categoryLanguageCache["M$categoryId"]?.let { return it.ifEmpty { null } }

        return try {
            val picks = XtreamClient.movies(credentials, categoryId)
                .filter { !it.poster.isNullOrBlank() }
                .sortedByDescending { it.added }
                .take(4)
            val plots = coroutineScope {
                picks.map { movie -> async { movieInfoOf(credentials, movie.id)?.plot } }.awaitAll()
            }
            val language = PlotLanguage.majority(plots)

            categoryLanguageCache["M$categoryId"] = language.orEmpty()
            language
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
    }

    private suspend fun sampleSeriesLanguage(credentials: Credentials, categoryId: String): String? {
        categoryLanguageCache["S$categoryId"]?.let { return it.ifEmpty { null } }

        return try {
            val picks = XtreamClient.series(credentials, categoryId)
                .filter { !it.poster.isNullOrBlank() }
                .sortedByDescending { it.added }
                .take(4)
            val plots = coroutineScope {
                picks.map { show ->
                    async {
                        try {
                            infoSemaphore.withPermit { cachedSeriesInfo(credentials, show.id).info.plot }
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            null
                        }
                    }
                }.awaitAll()
            }
            val language = PlotLanguage.majority(plots)

            categoryLanguageCache["S$categoryId"] = language.orEmpty()
            language
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
    }

    // Only the titles whose picture really loads are shown: no empty tile on the home page.
    private suspend fun <T> keepLoadedPosters(items: List<T>, poster: (T) -> String?, limit: Int): List<T> {
        val kept = ArrayList<T>()

        for (group in items.chunked(6)) {
            val loaded = coroutineScope { group.map { item -> async { imageLoads(poster(item)) } }.awaitAll() }

            group.forEachIndexed { position, item -> if (loaded[position]) kept.add(item) }

            if (kept.size >= limit) break
        }

        return kept.take(limit)
    }

    // Up to 5 highlights, movie and series in turn. A highlight must have a SYNOPSIS in the chosen
    // language and a PICTURE that really loads; the others are skipped and the next titles are
    // tried (4 at a time). Each one appears as soon as it is ready. If no title matches the
    // language, "auto" shows the others rather than an empty page.
    private suspend fun buildFeatured(
        credentials: Credentials,
        latestMovies: List<Movie>,
        latestSeries: List<Series>,
        target: String,
        strict: Boolean,
    ) {
        val candidates = ArrayList<Any>()

        for (position in 0 until 10) {
            latestMovies.getOrNull(position)?.let { candidates.add(it) }
            latestSeries.getOrNull(position)?.let { candidates.add(it) }
        }

        val matching = ArrayList<Featured>()
        val others = ArrayList<Featured>()

        for (group in candidates.chunked(4)) {
            val built = coroutineScope {
                group.map { candidate -> async { buildSlide(credentials, candidate) } }.awaitAll()
            }

            for (pair in built) {
                val (slide, language) = pair ?: continue

                if (language == target) {
                    if (matching.size < 5) matching.add(slide)
                } else {
                    others.add(slide)
                }
            }

            _featured.value = matching.toList()

            if (matching.size >= 5) break
        }

        if (matching.isEmpty()) {
            // Nothing in the chosen language: random movies and series (with a synopsis and a picture)
            // rather than an empty banner.
            _featured.value = randomSlides(credentials, target)
        }
    }

    // Titles taken at random in random categories; the ones in the chosen language come first.
    private suspend fun randomSlides(credentials: Credentials, target: String): List<Featured> {
        val candidates = ArrayList<Any>()

        try {
            for (category in homeMovieCategories.filter { it.id !in _hiddenMovies.value }.shuffled().take(2)) {
                candidates.addAll(
                    XtreamClient.movies(credentials, category.id).filter { !it.poster.isNullOrBlank() }.shuffled().take(8)
                )
            }

            for (category in homeSeriesCategories.filter { it.id !in _hiddenSeries.value }.shuffled().take(2)) {
                candidates.addAll(
                    XtreamClient.series(credentials, category.id).filter { !it.poster.isNullOrBlank() }.shuffled().take(8)
                )
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // what was found is used
        }

        val matching = ArrayList<Featured>()
        val others = ArrayList<Featured>()

        for (group in candidates.shuffled().chunked(4)) {
            val built = coroutineScope {
                group.map { candidate -> async { buildSlide(credentials, candidate) } }.awaitAll()
            }

            for (pair in built) {
                val (slide, language) = pair ?: continue

                if (language == target) matching.add(slide) else others.add(slide)
            }

            _featured.value = (matching + others).take(5)

            if (matching.size + others.size >= 5) break
        }

        return (matching + others).take(5)
    }

    // The slide and the language of its synopsis.
    private suspend fun buildSlide(credentials: Credentials, candidate: Any): Pair<Featured, String?>? =
        try {
            when (candidate) {
                is Movie -> {
                    val info = XtreamClient.movieInfo(credentials, candidate.id)
                    val image = info.backdrop?.takeIf { it.isNotBlank() } ?: candidate.poster

                    if (hasPlot(info.plot) && imageLoads(image)) {
                        Featured(
                            kind = MediaKind.MOVIE,
                            movie = candidate,
                            series = null,
                            title = candidate.name,
                            backdrop = image,
                            meta = metaOf(info, candidate.rating),
                            plot = info.plot,
                        ) to PlotLanguage.detect(info.plot)
                    } else {
                        null
                    }
                }
                is Series -> {
                    val info = cachedSeriesInfo(credentials, candidate.id).info
                    val image = info.backdrop?.takeIf { it.isNotBlank() } ?: candidate.poster

                    if (hasPlot(info.plot) && imageLoads(image)) {
                        Featured(
                            kind = MediaKind.SERIES,
                            movie = null,
                            series = candidate,
                            title = candidate.name,
                            backdrop = image,
                            meta = metaOf(info, candidate.rating),
                            plot = info.plot,
                        ) to PlotLanguage.detect(info.plot)
                    } else {
                        null
                    }
                }
                else -> null
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }

    private fun hasPlot(plot: String?): Boolean = (plot?.trim()?.length ?: 0) >= 30

    // The picture is downloaded now (it is then in the cache, so it shows at once).
    private suspend fun imageLoads(url: String?): Boolean {
        if (url.isNullOrBlank()) return false

        val app = getApplication<Application>()
        val request = ImageRequest.Builder(app).data(url).build()

        return app.imageLoader.execute(request) is SuccessResult
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
                        val list = if (credentials.isM3u) M3uClient.all(credentials) else XtreamClient.allLiveChannels(credentials)

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
            } catch (e: OutOfMemoryError) {
                // a list too big for this TV: the app must not close because of it
                channelIndex.set(emptyList())
                movieIndex.set(emptyList())
                seriesIndex.set(emptyList())
                throw java.io.IOException("Not enough memory for this list")
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
