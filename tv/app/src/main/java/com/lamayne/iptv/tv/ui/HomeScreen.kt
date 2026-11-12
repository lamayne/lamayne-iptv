package com.lamayne.iptv.tv.ui

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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lamayne.iptv.tv.MainViewModel
import com.lamayne.iptv.tv.Section
import com.lamayne.iptv.tv.data.Channel
import com.lamayne.iptv.tv.data.EpgInfo

@Composable
fun HomeScreen(viewModel: MainViewModel) {
    val section by viewModel.section.collectAsStateWithLifecycle()

    Column(modifier = Modifier.fillMaxSize()) {
        TopBar(
            section = section,
            onSelect = { viewModel.selectSection(it) },
            onSignOut = { viewModel.logout() },
        )

        when (section) {
            Section.LIVE -> LiveSection(viewModel)
            Section.FAVORITES -> SavedSection(
                viewModel = viewModel,
                channels = viewModel.favorites.collectAsStateWithLifecycle().value,
                emptyTitle = "No favourite yet",
                emptyHint = "While watching a channel, select the heart to keep it here.",
            )
            Section.RECENT -> SavedSection(
                viewModel = viewModel,
                channels = viewModel.recents.collectAsStateWithLifecycle().value,
                emptyTitle = "Nothing watched yet",
                emptyHint = "The channels you open will show up here.",
            )
            Section.SEARCH -> SearchSection(viewModel)
        }
    }
}

// ------------------------------------------------------------------ top bar

private fun labelOf(section: Section) =
    when (section) {
        Section.LIVE -> "Live TV"
        Section.FAVORITES -> "Favourites"
        Section.RECENT -> "Recent"
        Section.SEARCH -> "Search"
    }

@Composable
private fun TopBar(section: Section, onSelect: (Section) -> Unit, onSignOut: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 40.dp, vertical = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BrandMark(44.dp)
        Spacer(Modifier.width(12.dp))
        Wordmark()
        Spacer(Modifier.width(44.dp))

        for (item in Section.values()) {
            TabPill(labelOf(item), item == section) { onSelect(item) }
            Spacer(Modifier.width(8.dp))
        }

        Spacer(Modifier.weight(1f))

        TabPill("Sign out", false) { onSignOut() }
    }
}

@Composable
private fun TabPill(label: String, selected: Boolean, onClick: () -> Unit) {
    FocusCard(
        onClick = onClick,
        shape = RoundedCornerShape(50),
        container = if (selected) AccentDeep else Color.Transparent,
        focusedContainer = CardFocused,
        focusedScale = 1.06f,
    ) {
        Text(
            label,
            color = if (selected) Color.White else Muted,
            fontSize = 17.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp),
        )
    }
}

// ------------------------------------------------------------------ live TV

@Composable
private fun LiveSection(viewModel: MainViewModel) {
    val categories by viewModel.categories.collectAsStateWithLifecycle()
    val selected by viewModel.selectedCategory.collectAsStateWithLifecycle()
    val channels by viewModel.channels.collectAsStateWithLifecycle()
    val busy by viewModel.busy.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()

    Row(
        modifier = Modifier
            .fillMaxSize()
            .padding(start = 40.dp, end = 40.dp, bottom = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        Column(
            modifier = Modifier
                .width(280.dp)
                .fillMaxHeight()
                .clip(RoundedCornerShape(22.dp))
                .background(Panel)
                .padding(12.dp),
        ) {
            Text(
                "CATEGORIES",
                color = Muted,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 2.sp,
                modifier = Modifier.padding(start = 10.dp, top = 6.dp, bottom = 10.dp),
            )

            LazyColumn(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                items(categories) { category ->
                    val isSelected = category.id == selected?.id

                    FocusCard(
                        onClick = { viewModel.selectCategory(category) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        container = if (isSelected) AccentDeep else Color.Transparent,
                        focusedScale = 1.03f,
                    ) {
                        Text(
                            displayName(category.name),
                            color = if (isSelected) Color.White else TextMain,
                            fontSize = 16.sp,
                            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 11.dp),
                        )
                    }
                }

                item {
                    Spacer(Modifier.height(10.dp))
                }
            }
        }

        ChannelsPane(
            viewModel = viewModel,
            channels = channels,
            modifier = Modifier.weight(1f),
        ) {
            when {
                error != null -> MessageBlock(
                    title = "Could not load the channels",
                    hint = error.orEmpty(),
                    actionLabel = "Retry",
                    onAction = { viewModel.retry() },
                )
                busy -> MessageBlock(title = "Loading channels...", hint = "")
                else -> MessageBlock(title = "No channel in this category", hint = "")
            }
        }
    }
}

// ------------------------------------------------------------------ favourites, recent

@Composable
private fun SavedSection(
    viewModel: MainViewModel,
    channels: List<Channel>,
    emptyTitle: String,
    emptyHint: String,
) {
    ChannelsPane(
        viewModel = viewModel,
        channels = channels,
        modifier = Modifier
            .fillMaxSize()
            .padding(start = 40.dp, end = 40.dp, bottom = 24.dp),
    ) {
        MessageBlock(title = emptyTitle, hint = emptyHint)
    }
}

// ------------------------------------------------------------------ search

@Composable
private fun SearchSection(viewModel: MainViewModel) {
    val query by viewModel.searchQuery.collectAsStateWithLifecycle()
    val results by viewModel.searchResults.collectAsStateWithLifecycle()
    val loading by viewModel.searchLoading.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(start = 40.dp, end = 40.dp, bottom = 24.dp),
    ) {
        OutlinedTextField(
            value = query,
            onValueChange = { viewModel.setSearchQuery(it) },
            label = { Text("Search a channel") },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            modifier = Modifier.fillMaxWidth(),
        )

        Spacer(Modifier.height(14.dp))

        ChannelsPane(
            viewModel = viewModel,
            channels = results,
            modifier = Modifier.weight(1f),
        ) {
            when {
                loading -> MessageBlock(
                    title = "Loading all channels...",
                    hint = "This happens once. It can take a few seconds.",
                )
                query.trim().length < 2 -> MessageBlock(
                    title = "Search",
                    hint = "Type at least 2 letters of a channel name.",
                )
                else -> MessageBlock(title = "No channel found", hint = "Try another spelling.")
            }
        }
    }
}

// ------------------------------------------------------------------ shared pieces

// The programme of the channel under the cursor on top, the channels below.
@Composable
private fun ChannelsPane(
    viewModel: MainViewModel,
    channels: List<Channel>,
    modifier: Modifier,
    empty: @Composable () -> Unit,
) {
    val favorites by viewModel.favorites.collectAsStateWithLifecycle()
    val focused by viewModel.focused.collectAsStateWithLifecycle()
    val focusedEpg by viewModel.focusedEpg.collectAsStateWithLifecycle()
    val favoriteIds = remember(favorites) { favorites.map { it.id }.toSet() }
    val firstFocus = remember { FocusRequester() }

    // When a new list appears, the cursor goes to its first channel.
    LaunchedEffect(channels.firstOrNull()?.id) {
        if (channels.isNotEmpty()) {
            runCatching { firstFocus.requestFocus() }
        }
    }

    Column(modifier = modifier) {
        InfoPanel(
            channel = focused,
            epg = focusedEpg,
            favorite = focused?.let { favoriteIds.contains(it.id) } == true,
        )

        Spacer(Modifier.height(16.dp))

        if (channels.isEmpty()) {
            empty()
        } else {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(190.dp),
                contentPadding = PaddingValues(bottom = 24.dp, top = 6.dp, start = 6.dp, end = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                itemsIndexed(channels) { index, channel ->
                    ChannelCard(
                        channel = channel,
                        favorite = favoriteIds.contains(channel.id),
                        focusRequester = if (index == 0) firstFocus else null,
                        onFocused = { viewModel.focusChannel(channel) },
                        onClick = { viewModel.play(channel, channels) },
                    )
                }
            }
        }
    }
}

@Composable
private fun ChannelCard(
    channel: Channel,
    favorite: Boolean,
    focusRequester: FocusRequester?,
    onFocused: () -> Unit,
    onClick: () -> Unit,
) {
    FocusCard(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .height(150.dp),
        focusRequester = focusRequester,
        onFocused = onFocused,
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .background(LogoBg),
                contentAlignment = Alignment.Center,
            ) {
                ChannelLogo(channel, Modifier.fillMaxSize().padding(14.dp))

                if (favorite) {
                    Icon(
                        Icons.Filled.Favorite,
                        contentDescription = null,
                        tint = Accent,
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(8.dp)
                            .size(20.dp),
                    )
                }
            }

            Text(
                displayName(channel.name),
                color = TextMain,
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            )
        }
    }
}

@Composable
private fun InfoPanel(channel: Channel?, epg: EpgInfo?, favorite: Boolean) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(132.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(Brush.horizontalGradient(listOf(Color(0xFF2A1F5C), Color(0xFF15152A))))
            .padding(horizontal = 22.dp, vertical = 16.dp),
    ) {
        if (channel == null) {
            Text(
                "Pick a channel to start watching.",
                color = Muted,
                fontSize = 18.sp,
                modifier = Modifier.align(Alignment.CenterStart),
            )
        } else {
            Row(
                modifier = Modifier.fillMaxSize(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(width = 124.dp, height = 84.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(LogoBg),
                ) {
                    ChannelLogo(channel, Modifier.fillMaxSize().padding(10.dp))
                }

                Spacer(Modifier.width(20.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            displayName(channel.name),
                            color = Color.White,
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )

                        if (favorite) {
                            Spacer(Modifier.width(10.dp))
                            Icon(
                                Icons.Filled.Favorite,
                                contentDescription = null,
                                tint = Accent,
                                modifier = Modifier.size(22.dp),
                            )
                        }
                    }

                    Spacer(Modifier.height(6.dp))

                    val now = epg?.now

                    if (now != null) {
                        val nowSeconds = System.currentTimeMillis() / 1000

                        Text(
                            "${formatClock(now.start)} - ${formatClock(now.stop)}   ${now.title}",
                            color = TextMain,
                            fontSize = 16.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )

                        Spacer(Modifier.height(8.dp))

                        ProgressLine(now.progress(nowSeconds), Modifier.fillMaxWidth())

                        val next = epg?.next

                        if (next != null) {
                            Spacer(Modifier.height(6.dp))

                            Text(
                                "Next  ${formatClock(next.start)}   ${next.title}",
                                color = Muted,
                                fontSize = 14.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    } else {
                        Text(
                            if (epg == null) "Loading the programme..." else "No programme information for this channel.",
                            color = Muted,
                            fontSize = 16.sp,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MessageBlock(
    title: String,
    hint: String,
    actionLabel: String? = null,
    onAction: () -> Unit = {},
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, color = TextMain, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)

        if (hint.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text(hint, color = Muted, fontSize = 16.sp)
        }

        if (actionLabel != null) {
            Spacer(Modifier.height(18.dp))

            FocusCard(
                onClick = onAction,
                shape = RoundedCornerShape(50),
                container = Accent,
                focusedContainer = AccentBright,
                borderColor = Color.White,
            ) {
                Text(
                    actionLabel,
                    color = Color.White,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 28.dp, vertical = 11.dp),
                )
            }
        }
    }
}
