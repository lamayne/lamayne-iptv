package com.lamayne.iptv.tv.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lamayne.iptv.tv.MainViewModel
import com.lamayne.iptv.tv.R
import com.lamayne.iptv.tv.Tab
import com.lamayne.iptv.tv.data.MediaKind

@Composable
fun LiveTab(viewModel: MainViewModel) {
    val hidden by viewModel.hiddenLive.collectAsStateWithLifecycle()
    val epgMap by viewModel.epgMap.collectAsStateWithLifecycle()
    val favorites by viewModel.favChannels.collectAsStateWithLifecycle()
    val results by viewModel.searchChannels.collectAsStateWithLifecycle()
    val favoriteIds = remember(favorites) { favorites.map { it.id }.toSet() }
    val epgVersion by viewModel.epgVersion.collectAsStateWithLifecycle()

    BrowsePage(
        viewModel = viewModel,
        kind = MediaKind.LIVE,
        controller = viewModel.live,
        hidden = hidden,
        favorites = favorites,
        searchResults = results,
        idOf = { it.id },
        panelTitle = R.string.live_categories,
        countFormat = R.string.live_count,
        searchHint = R.string.search_hint_live,
        onSelectCategory = { viewModel.selectLiveCategory(it) },
        onRetry = { viewModel.retry(Tab.LIVE) },
    ) { list, startIndex, firstFocus ->
        val listState = rememberLazyListState(initialFirstVisibleItemIndex = startIndex)

        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(vertical = 6.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            itemsIndexed(list) { index, channel ->
                // Each visible line asks for its own programme (3 at a time).
                LaunchedEffect(channel.id, epgVersion) { viewModel.requestEpg(channel) }

                ChannelRow(
                    channel = channel,
                    epg = epgMap[channel.id],
                    favorite = favoriteIds.contains(channel.id),
                    focusRequester = if (index == startIndex) firstFocus else null,
                    onClick = { viewModel.playLive(channel, list) },
                )
            }
        }
    }
}
