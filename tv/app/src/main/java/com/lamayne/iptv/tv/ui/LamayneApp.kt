package com.lamayne.iptv.tv.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lamayne.iptv.tv.MainViewModel
import com.lamayne.iptv.tv.Route
import com.lamayne.iptv.tv.data.MediaKind
import com.lamayne.iptv.tv.data.Movie
import com.lamayne.iptv.tv.data.Series
import com.lamayne.iptv.tv.data.XtreamClient

@Composable
fun LamayneApp(viewModel: MainViewModel) {
    val credentials by viewModel.credentials.collectAsStateWithLifecycle()
    val playing by viewModel.playing.collectAsStateWithLifecycle()
    val playingEpg by viewModel.playingEpg.collectAsStateWithLifecycle()
    val stack by viewModel.stack.collectAsStateWithLifecycle()
    val favChannels by viewModel.favChannels.collectAsStateWithLifecycle()
    val favMovies by viewModel.favMovies.collectAsStateWithLifecycle()
    val favSeries by viewModel.favSeries.collectAsStateWithLifecycle()
    val account = credentials
    val channel = playing
    val route = stack.lastOrNull()

    Box(modifier = Modifier.fillMaxSize()) {
        AppBackground()

        when {
            account == null -> LoginScreen(viewModel)

            channel != null -> {
                val urls = remember(account, channel.id) {
                    XtreamClient.streamUrls(account, channel)
                }

                LivePlayerScreen(
                    channel = channel,
                    urls = urls,
                    epg = playingEpg,
                    favorite = favChannels.any { it.id == channel.id },
                    onToggleFavorite = { viewModel.toggleFavorite(channel) },
                    onZap = { delta -> viewModel.zap(delta) },
                    onBack = { viewModel.stopLive() },
                )
            }

            route is Route.PlayVod -> {
                val request = route.request

                // One player per movie or episode: nothing from the previous one is kept.
                key(request.id) {
                    val url = remember(account, request.id) { XtreamClient.vodUrl(account, request) }
                    val favorite = if (request.kind == MediaKind.EPISODE) {
                        favSeries.any { it.id == request.seriesId }
                    } else {
                        favMovies.any { it.id == request.id }
                    }

                    VodPlayerScreen(
                        request = request,
                        url = url,
                        favorite = favorite,
                        onToggleFavorite = {
                            if (request.kind == MediaKind.EPISODE) {
                                val seriesId = request.seriesId

                                if (seriesId != null) {
                                    viewModel.toggleFavorite(
                                        Series(seriesId, request.seriesName.orEmpty(), request.image, null, null, 0L)
                                    )
                                }
                            } else {
                                viewModel.toggleFavorite(
                                    Movie(request.id, request.title, request.image, request.categoryId, request.ext, null, 0L)
                                )
                            }
                        },
                        onProgress = { position, duration -> viewModel.saveProgress(request, position, duration) },
                        onEnded = { viewModel.playNext(request) },
                        onNext = { viewModel.playNext(request) },
                        onBack = { viewModel.back() },
                    )
                }
            }

            route is Route.MovieDetails -> MovieDetailsScreen(viewModel, route.movie)

            route is Route.SeriesDetails -> SeriesDetailsScreen(viewModel, route.series)

            route is Route.ManageCategories -> ManageCategoriesScreen(viewModel, route.kind)

            route is Route.Actor -> ActorScreen(viewModel, route.name)

            else -> MainScreen(viewModel)
        }
    }
}
