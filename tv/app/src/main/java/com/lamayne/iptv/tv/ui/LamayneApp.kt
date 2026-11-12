package com.lamayne.iptv.tv.ui

import androidx.compose.foundation.background
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
    val account = credentials
    val channel = playing

    Box(modifier = Modifier.fillMaxSize().background(Background)) {
        when {
            account == null -> LoginScreen(viewModel)
            channel != null -> {
                val urls = remember(account, channel) {
                    XtreamClient.streamUrls(account, channel)
                }

                PlayerScreen(
                    title = channel.name,
                    urls = urls,
                    onBack = { viewModel.stop() },
                )
            }
            else -> BrowseScreen(viewModel)
        }
    }
}
