package com.lamayne.iptv.tv.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lamayne.iptv.tv.MainViewModel
import com.lamayne.iptv.tv.data.XtreamClient

@Composable
fun LamayneApp(viewModel: MainViewModel) {
    val credentials by viewModel.credentials.collectAsStateWithLifecycle()
    val playing by viewModel.playing.collectAsStateWithLifecycle()
    val playingEpg by viewModel.playingEpg.collectAsStateWithLifecycle()
    val favorites by viewModel.favorites.collectAsStateWithLifecycle()
    val account = credentials
    val channel = playing

    Box(modifier = Modifier.fillMaxSize()) {
        AppBackground()

        when {
            account == null -> LoginScreen(viewModel)
            channel != null -> {
                val urls = remember(account, channel.id) {
                    XtreamClient.streamUrls(account, channel)
                }

                PlayerScreen(
                    channel = channel,
                    urls = urls,
                    epg = playingEpg,
                    favorite = favorites.any { it.id == channel.id },
                    onToggleFavorite = { viewModel.toggleFavorite(channel) },
                    onZap = { delta -> viewModel.zap(delta) },
                    onBack = { viewModel.stop() },
                )
            }
            else -> HomeScreen(viewModel)
        }
    }
}
