package com.lamayne.iptv.tv.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lamayne.iptv.tv.MainViewModel
import com.lamayne.iptv.tv.R
import com.lamayne.iptv.tv.Tab

@Composable
fun LiveTab(viewModel: MainViewModel) {
    val categories by viewModel.live.categories.collectAsStateWithLifecycle()
    val selected by viewModel.live.selected.collectAsStateWithLifecycle()
    val channels by viewModel.live.items.collectAsStateWithLifecycle()
    val loading by viewModel.live.loading.collectAsStateWithLifecycle()
    val error by viewModel.live.error.collectAsStateWithLifecycle()
    val hidden by viewModel.hiddenLive.collectAsStateWithLifecycle()
    val epgMap by viewModel.epgMap.collectAsStateWithLifecycle()
    val favorites by viewModel.favChannels.collectAsStateWithLifecycle()
    val favoriteIds = remember(favorites) { favorites.map { it.id }.toSet() }
    val firstFocus = remember { FocusRequester() }

    FocusFirstWhen(channels.firstOrNull()?.id, channels.isNotEmpty(), firstFocus)

    Row(
        modifier = Modifier
            .fillMaxSize()
            .padding(start = 48.dp, end = 48.dp, bottom = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(22.dp),
    ) {
        CategoryPanel(
            title = stringResource(R.string.live_categories),
            categories = categories,
            hidden = hidden,
            selectedId = selected?.id,
            onSelect = { viewModel.selectLiveCategory(it) },
            modifier = Modifier.width(250.dp),
        )

        Column(modifier = Modifier.weight(1f)) {
            ListHeader(
                title = selected?.let { displayName(it.name) } ?: stringResource(R.string.nav_live),
                count = if (channels.isEmpty()) "" else stringResource(R.string.live_count, channels.size),
            )

            val failure = error

            when {
                failure != null -> MessageBlock(
                    title = stringResource(R.string.error_load_title),
                    hint = failure.errorText(),
                    actionLabel = stringResource(R.string.common_retry),
                    onAction = { viewModel.retry(Tab.LIVE) },
                )
                loading && channels.isEmpty() -> MessageBlock(
                    title = stringResource(R.string.common_loading),
                    hint = "",
                )
                channels.isEmpty() -> MessageBlock(
                    title = stringResource(R.string.browse_empty),
                    hint = "",
                )
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(vertical = 6.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    itemsIndexed(channels) { index, channel ->
                        // Each visible line asks for its own programme (3 at a time).
                        LaunchedEffect(channel.id) { viewModel.requestEpg(channel.id) }

                        ChannelRow(
                            channel = channel,
                            epg = epgMap[channel.id],
                            favorite = favoriteIds.contains(channel.id),
                            focusRequester = if (index == 0) firstFocus else null,
                            onClick = { viewModel.playLive(channel, channels) },
                        )
                    }
                }
            }
        }
    }
}
