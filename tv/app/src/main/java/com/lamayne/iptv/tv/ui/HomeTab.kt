package com.lamayne.iptv.tv.ui

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.lamayne.iptv.tv.MainViewModel
import com.lamayne.iptv.tv.R
import com.lamayne.iptv.tv.Tab
import com.lamayne.iptv.tv.data.Featured
import com.lamayne.iptv.tv.data.MediaKind
import com.lamayne.iptv.tv.data.UiError
import com.lamayne.iptv.tv.data.WatchProgress
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// The home page: one list. The banner (picture + texts) is its first element. When the cursor
// goes down into the rows, the banner scrolls away upward and the rows take the whole
// screen; when the cursor comes back up, the banner comes back, complete (never half hidden).
@Composable
fun HomeTab(viewModel: MainViewModel, entryFocus: FocusRequester) {
    val featured by viewModel.featured.collectAsStateWithLifecycle()
    val latestMovies by viewModel.latestMovies.collectAsStateWithLifecycle()
    val latestSeries by viewModel.latestSeries.collectAsStateWithLifecycle()
    val favChannels by viewModel.favChannels.collectAsStateWithLifecycle()
    val favMovies by viewModel.favMovies.collectAsStateWithLifecycle()
    val favSeries by viewModel.favSeries.collectAsStateWithLifecycle()
    val newestFirst by viewModel.favNewestFirst.collectAsStateWithLifecycle()
    val favChannelsShown = if (newestFirst) favChannels else favChannels.asReversed()
    val favMoviesShown = if (newestFirst) favMovies else favMovies.asReversed()
    val favSeriesShown = if (newestFirst) favSeries else favSeries.asReversed()
    val progress by viewModel.progress.collectAsStateWithLifecycle()
    val loading by viewModel.homeLoading.collectAsStateWithLifecycle()
    val error by viewModel.homeError.collectAsStateWithLifecycle()
    val epgMap by viewModel.epgMap.collectAsStateWithLifecycle()
    val epgVersion by viewModel.epgVersion.collectAsStateWithLifecycle()
    val continueItems = remember(progress) {
        progress.filter { it.inProgress }.sortedByDescending { it.updatedAt }.take(20)
    }
    var index by remember { mutableStateOf(0) }
    var heroFocused by remember { mutableStateOf(false) }
    var focusedOnce by remember { mutableStateOf(false) }
    var focusedRow by remember { mutableStateOf(-1) }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()

    // A title that is already in "Continue watching" is not put forward again: seeing the
    // same film twice (big picture and a resume card) was confusing.
    val startedMovies = remember(continueItems) {
        continueItems.filter { it.kind == MediaKind.MOVIE }.map { it.id }.toSet()
    }
    val startedSeries = remember(continueItems) { continueItems.mapNotNull { it.seriesId }.toSet() }
    val fresh = remember(featured, startedMovies, startedSeries) {
        featured.filter { f ->
            val movieId = f.movie?.id
            val seriesId = f.series?.id

            !(movieId != null && movieId in startedMovies) && !(seriesId != null && seriesId in startedSeries)
        }
    }
    val slides = fresh.ifEmpty { featured }
    val count = slides.size
    val slide = if (count > 0) slides[index % count] else null

    // Nothing to put forward (and nothing loading): no empty banner, the rows start at the top.
    val showHero = slide != null || loading || error != null

    // The favourite channels show what is on now.
    LaunchedEffect(favChannels, epgVersion) {
        favChannels.take(30).forEach { viewModel.requestEpg(it) }
    }

    // The banner changes by itself, but only while the cursor is on it.
    LaunchedEffect(index, count, heroFocused) {
        if (count > 1 && heroFocused) {
            delay(9_000)
            index = (index + 1) % count
        }
    }

    // The cursor starts on the Play button as soon as there is one.
    LaunchedEffect(count > 0) {
        if (count > 0 && !focusedOnce) {
            focusedOnce = true
            runCatching { entryFocus.requestFocus() }
        }
    }

    // Cursor in the rows -> the banner goes up and away. Cursor on the banner -> it is back.
    val rowsFocused = focusedRow >= 1

    LaunchedEffect(rowsFocused) {
        if (rowsFocused && showHero) listState.animateScrollToItem(1)
    }

    LaunchedEffect(heroFocused) {
        if (heroFocused) listState.animateScrollToItem(0)
    }

    val onRowFocus: (Int, Boolean) -> Unit = { order, has ->
        if (has) focusedRow = order else if (focusedRow == order) focusedRow = -1
    }

    LazyColumn(
        state = listState,
        modifier = Modifier
            .fillMaxSize()
            .onPreviewKeyEvent { event ->
                // Up from the first row: the banner (scrolled away, so not reachable by itself)
                // comes back and takes the cursor.
                if (event.type == KeyEventType.KeyDown && event.key == Key.DirectionUp && focusedRow == 1 && showHero) {
                    scope.launch {
                        listState.animateScrollToItem(0)
                        delay(150)
                        runCatching { entryFocus.requestFocus() }
                    }
                    true
                } else {
                    false
                }
            },
        contentPadding = PaddingValues(bottom = 48.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (showHero) item {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(260.dp),
            ) {
                HomeBackdrop(
                    slide?.backdrop,
                    Modifier
                        .align(Alignment.TopEnd)
                        .fillMaxWidth(0.7f)
                        .fillMaxHeight(),
                )

                // Behind the texts: the title stays readable whatever the picture.
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.6f)
                        .fillMaxHeight()
                        .background(Brush.horizontalGradient(listOf(Color(0xD90A0A12), Color.Transparent))),
                )

                HeroBlock(
                    slide = slide,
                    count = count,
                    index = index,
                    loading = loading,
                    error = error,
                    requester = entryFocus,
                    onRetry = { viewModel.retry(Tab.HOME) },
                    // "Play" opens the page of the movie or series: Play, Resume and the
                    // rest are there.
                    onOpen = { chosen ->
                        val movie = chosen.movie

                        if (movie != null) viewModel.openMovie(movie)
                        else chosen.series?.let { viewModel.openSeries(it) }
                    },
                    onStep = { delta -> if (count > 1) index = (index + delta + count) % count },
                    onFocusChange = { heroFocused = it },
                )
            }
        }

        var order = 0

        if (continueItems.isNotEmpty()) {
            val mine = ++order

            item {
                Box(modifier = Modifier.onFocusChanged { onRowFocus(mine, it.hasFocus) }) {
                    ContentRow(stringResource(R.string.home_continue), continueItems) { item ->
                        WideCard(
                            title = displayName(item.seriesName ?: item.title),
                            subtitle = if (item.kind == MediaKind.EPISODE) {
                                "S${item.season} E${item.number}  \u2022  ${item.title}"
                            } else {
                                null
                            },
                            image = item.image,
                            progress = item.fraction,
                            modifier = Modifier.width(120.dp),
                            onClick = { viewModel.resume(item) },
                        )
                    }
                }
            }
        }

        if (favChannels.isNotEmpty()) {
            val mine = ++order

            item {
                Box(modifier = Modifier.onFocusChanged { onRowFocus(mine, it.hasFocus) }) {
                    ContentRow(stringResource(R.string.home_my_channels), favChannelsShown) { channel ->
                        val now = epgMap[channel.id]?.now

                        ChannelTile(
                            channel = channel,
                            modifier = Modifier.width(100.dp),
                            nowTitle = now?.title,
                            nowProgress = now?.progress(System.currentTimeMillis() / 1000),
                            onLongClick = { viewModel.toggleFavorite(channel) },
                            onClick = { viewModel.playLive(channel, favChannelsShown) },
                        )
                    }
                }
            }
        }

        if (favMovies.isNotEmpty()) {
            val mine = ++order

            item {
                Box(modifier = Modifier.onFocusChanged { onRowFocus(mine, it.hasFocus) }) {
                    ContentRow(stringResource(R.string.home_my_movies), favMoviesShown) { movie ->
                        PosterCard(
                            title = displayName(movie.name),
                            image = movie.poster,
                            modifier = Modifier.width(100.dp),
                            rating = ratingText(movie.rating),
                            onLongClick = { viewModel.toggleFavorite(movie) },
                            onClick = { viewModel.openMovie(movie) },
                        )
                    }
                }
            }
        }

        if (favSeries.isNotEmpty()) {
            val mine = ++order

            item {
                Box(modifier = Modifier.onFocusChanged { onRowFocus(mine, it.hasFocus) }) {
                    ContentRow(stringResource(R.string.home_my_series), favSeriesShown) { series ->
                        PosterCard(
                            title = displayName(series.name),
                            image = series.poster,
                            modifier = Modifier.width(100.dp),
                            rating = ratingText(series.rating),
                            onLongClick = { viewModel.toggleFavorite(series) },
                            onClick = { viewModel.openSeries(series) },
                        )
                    }
                }
            }
        }

        if (latestMovies.isNotEmpty()) {
            val mine = ++order

            item {
                Box(modifier = Modifier.onFocusChanged { onRowFocus(mine, it.hasFocus) }) {
                    ContentRow(stringResource(R.string.home_latest_movies), latestMovies) { movie ->
                        PosterCard(
                            title = displayName(movie.name),
                            image = movie.poster,
                            modifier = Modifier.width(100.dp),
                            rating = ratingText(movie.rating),
                            onLongClick = { viewModel.toggleFavorite(movie) },
                            onClick = { viewModel.openMovie(movie) },
                        )
                    }
                }
            }
        }

        if (latestSeries.isNotEmpty()) {
            val mine = ++order

            item {
                Box(modifier = Modifier.onFocusChanged { onRowFocus(mine, it.hasFocus) }) {
                    ContentRow(stringResource(R.string.home_latest_series), latestSeries) { series ->
                        PosterCard(
                            title = displayName(series.name),
                            image = series.poster,
                            modifier = Modifier.width(100.dp),
                            rating = ratingText(series.rating),
                            onLongClick = { viewModel.toggleFavorite(series) },
                            onClick = { viewModel.openSeries(series) },
                        )
                    }
                }
            }
        }
    }
}

// The picture behind the page. It is not framed: the left, the top and the bottom are
// made transparent, so it melts into the background of the app whatever is behind.
@Composable
private fun HomeBackdrop(url: String?, modifier: Modifier) {
    Crossfade(
        targetState = url,
        animationSpec = tween(900),
        label = "backdrop",
        modifier = modifier
            .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
            .drawWithContent {
                drawContent()

                // left -> right: melts into the page on the left
                drawRect(
                    brush = Brush.horizontalGradient(
                        0f to Color.Transparent,
                        0.45f to Color(0xB3000000),
                        0.8f to Color.Black,
                    ),
                    blendMode = BlendMode.DstIn,
                )

                // top -> bottom: melts at the top, and is gone at the bottom of the zone, so
                // the rows below sit on a clean background
                drawRect(
                    brush = Brush.verticalGradient(
                        0f to Color.Transparent,
                        0.14f to Color.Black,
                        0.55f to Color.Black,
                        1f to Color.Transparent,
                    ),
                    blendMode = BlendMode.DstIn,
                )
            },
    ) { current ->
        if (current != null) {
            AsyncImage(
                model = current,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                alignment = BiasAlignment(1f, -1f),
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

// What is put forward: kind, title, a few pastilles, the plot, the Play button and the dots.
// Left / right change the one that is shown.
@Composable
private fun HeroBlock(
    slide: Featured?,
    count: Int,
    index: Int,
    loading: Boolean,
    error: UiError?,
    requester: FocusRequester,
    onRetry: () -> Unit,
    onOpen: (Featured) -> Unit,
    onStep: (Int) -> Unit,
    onFocusChange: (Boolean) -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .onFocusChanged { onFocusChange(it.hasFocus) }
            .onPreviewKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown || count < 2) {
                    false
                } else {
                    when (event.key) {
                        Key.DirectionRight -> {
                            onStep(1)
                            true
                        }
                        Key.DirectionLeft -> {
                            onStep(-1)
                            true
                        }
                        else -> false
                    }
                }
            },
    ) {
        if (slide == null) {
            when {
                error != null -> Box(Modifier.align(Alignment.Center)) {
                    MessageBlock(
                        title = stringResource(R.string.error_load_title),
                        hint = error.errorText(),
                        actionLabel = stringResource(R.string.common_retry),
                        onAction = onRetry,
                    )
                }
                loading -> HeroSkeleton(Modifier.align(Alignment.BottomStart))
                else -> Text(
                    stringResource(R.string.home_nothing),
                    color = Muted,
                    fontSize = 18.sp,
                    modifier = Modifier.align(Alignment.Center),
                )
            }
        } else {
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(start = 48.dp, bottom = 6.dp)
                    .width(480.dp),
            ) {
                // Only the texts change between two banners: the button keeps the cursor.
                run {
                    val shown: Featured = slide

                    Column {
                        Text(
                            stringResource(
                                if (shown.kind == MediaKind.MOVIE) R.string.hero_new_movie else R.string.hero_new_series
                            ).uppercase(),
                            color = AccentBright,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 3.sp,
                        )

                        Spacer(Modifier.height(4.dp))

                        Text(
                            displayName(shown.title),
                            color = Color.White,
                            style = TextStyle(
                                shadow = Shadow(color = Color(0xCC000000), offset = Offset(0f, 3f), blurRadius = 12f),
                            ),
                            fontSize = 32.sp,
                            fontWeight = FontWeight.Bold,
                            lineHeight = 36.sp,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )

                        if (shown.meta.isNotEmpty()) {
                            Spacer(Modifier.height(8.dp))

                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                for (chip in shown.meta.split("  \u2022  ").take(4)) {
                                    Text(
                                        chip,
                                        color = Color.White,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Medium,
                                        maxLines = 1,
                                        modifier = Modifier
                                            .background(Color(0x33FFFFFF), RoundedCornerShape(50))
                                            .padding(horizontal = 10.dp, vertical = 3.dp),
                                    )
                                }
                            }
                        }

                        if (!shown.plot.isNullOrBlank()) {
                            Spacer(Modifier.height(8.dp))

                            Text(
                                shown.plot,
                                color = Color(0xFFE0E0EC),
                                fontSize = 14.sp,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))

                Row(verticalAlignment = Alignment.CenterVertically) {
                    ActionButton(
                        text = stringResource(R.string.details_play),
                        onClick = { onOpen(slide) },
                        primary = true,
                        focusRequester = requester,
                        icon = {
                            Icon(
                                Icons.Filled.PlayArrow,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(22.dp),
                            )
                        },
                    )

                    if (count > 1) {
                        Spacer(Modifier.width(20.dp))

                        Row(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            for (position in 0 until count) {
                                Box(
                                    modifier = Modifier
                                        .size(width = if (position == index % count) 22.dp else 8.dp, height = 8.dp)
                                        .clip(RoundedCornerShape(50))
                                        .background(if (position == index % count) Accent else Color(0x66FFFFFF)),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

// Grey shapes that pulse while the banner is being prepared: the page is never empty.
@Composable
private fun HeroSkeleton(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "skeleton")
    val pulse by transition.animateFloat(
        initialValue = 0.4f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(900), RepeatMode.Reverse),
        label = "pulse",
    )

    @Composable
    fun Bar(width: Dp, height: Dp, radius: Dp = 8.dp) {
        Box(
            modifier = Modifier
                .size(width = width, height = height)
                .background(Color.White.copy(alpha = 0.12f * pulse), RoundedCornerShape(radius)),
        )
    }

    Column(
        modifier = modifier.padding(start = 48.dp, bottom = 10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Bar(70.dp, 12.dp)
        Bar(380.dp, 34.dp)
        Bar(300.dp, 14.dp)
        Bar(420.dp, 14.dp)
        Spacer(Modifier.height(4.dp))
        Bar(120.dp, 42.dp, 14.dp)
    }
}
