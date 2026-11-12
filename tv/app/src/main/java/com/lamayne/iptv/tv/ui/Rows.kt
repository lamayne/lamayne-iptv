package com.lamayne.iptv.tv.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.lazy.itemsIndexed
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lamayne.iptv.tv.MainViewModel
import com.lamayne.iptv.tv.R
import com.lamayne.iptv.tv.data.BrowseController
import com.lamayne.iptv.tv.data.Category
import com.lamayne.iptv.tv.data.Channel
import com.lamayne.iptv.tv.data.EpgInfo
import com.lamayne.iptv.tv.data.MediaKind

// One channel as a compact line: small logo (no grey tile), name, what is on now
// and its progress.
@Composable
fun ChannelRow(
    channel: Channel,
    epg: EpgInfo?,
    favorite: Boolean,
    modifier: Modifier = Modifier,
    focusRequester: FocusRequester? = null,
    onClick: () -> Unit,
) {
    FocusCard(
        onClick = onClick,
        modifier = modifier
            .fillMaxWidth()
            .height(64.dp),
        shape = RoundedCornerShape(14.dp),
        focusedScale = 1.02f,
        focusRequester = focusRequester,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight()
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ChannelLogo(channel, Modifier.size(width = 64.dp, height = 44.dp).padding(2.dp))

            Spacer(Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    displayName(channel.name),
                    color = TextMain,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )

                val nowTitle = epg?.now?.title

                Text(
                    when {
                        nowTitle != null -> nowTitle
                        epg == null -> ""
                        else -> stringResource(R.string.live_no_guide)
                    },
                    color = Muted,
                    fontSize = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            val now = epg?.now

            if (now != null) {
                val nowSeconds = System.currentTimeMillis() / 1000

                Spacer(Modifier.width(16.dp))

                Column(horizontalAlignment = Alignment.End, modifier = Modifier.width(110.dp)) {
                    Text(
                        "${formatClock(now.start)} - ${formatClock(now.stop)}",
                        color = Muted,
                        fontSize = 12.sp,
                        maxLines = 1,
                    )

                    Spacer(Modifier.height(6.dp))

                    ProgressLine(now.progress(nowSeconds), Modifier.fillMaxWidth())
                }
            }

            if (favorite) {
                Spacer(Modifier.width(14.dp))
                Icon(
                    Icons.Filled.Favorite,
                    contentDescription = null,
                    tint = Accent,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
    }
}

// What the right side of a Live TV, Movies or Series page shows.
enum class BrowseMode { FAVORITES, SEARCH, CATEGORY }

@Composable
private fun SpecialRow(
    label: String,
    icon: @Composable () -> Unit,
    selected: Boolean,
    onClick: () -> Unit,
) {
    FocusCard(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        container = if (selected) AccentDeep else Color.Transparent,
        focusedScale = 1.02f,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            icon()
            Spacer(Modifier.width(10.dp))
            Text(
                label,
                color = if (selected) Color.White else TextMain,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
        }
    }
}

// The list on the left: Favourites and Search first, then the categories.
@Composable
fun CategoryPanel(
    title: String,
    categories: List<Category>,
    hidden: Set<String>,
    mode: BrowseMode,
    selectedId: String?,
    onFavorites: () -> Unit,
    onSearch: () -> Unit,
    onSelect: (Category) -> Unit,
    modifier: Modifier = Modifier,
) {
    val visible = remember(categories, hidden) { categories.filter { it.id !in hidden } }

    Column(
        modifier = modifier
            .fillMaxHeight()
            .clip(RoundedCornerShape(20.dp))
            .background(Panel)
            .padding(10.dp),
    ) {
        Text(
            title.uppercase(),
            color = Muted,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 2.sp,
            modifier = Modifier.padding(start = 10.dp, top = 6.dp, bottom = 8.dp),
        )

        LazyColumn(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            item {
                SpecialRow(
                    label = stringResource(R.string.browse_favorites),
                    icon = {
                        Icon(
                            Icons.Filled.Favorite,
                            contentDescription = null,
                            tint = Accent,
                            modifier = Modifier.size(18.dp),
                        )
                    },
                    selected = mode == BrowseMode.FAVORITES,
                    onClick = onFavorites,
                )
            }

            item {
                SpecialRow(
                    label = stringResource(R.string.browse_search),
                    icon = {
                        Icon(
                            Icons.Filled.Search,
                            contentDescription = null,
                            tint = AccentBright,
                            modifier = Modifier.size(18.dp),
                        )
                    },
                    selected = mode == BrowseMode.SEARCH,
                    onClick = onSearch,
                )
            }

            item { Spacer(Modifier.height(6.dp)) }

            itemsIndexed(visible) { _, category ->
                val selected = mode == BrowseMode.CATEGORY && category.id == selectedId

                FocusCard(
                    onClick = { onSelect(category) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    container = if (selected) AccentDeep else Color.Transparent,
                    focusedScale = 1.02f,
                ) {
                    Text(
                        displayName(category.name),
                        color = if (selected) Color.White else TextMain,
                        fontSize = 15.sp,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
                    )
                }
            }
        }
    }
}

// The title of the page on top of a list, with a count on the right.
@Composable
fun ListHeader(title: String, count: String, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(bottom = 10.dp, start = 4.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            title,
            color = Color.White,
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )

        Text(count, color = Muted, fontSize = 14.sp)
    }
}

// Moves the cursor onto the first element of a list when the list changes.
@Composable
fun FocusFirstWhen(key: Any?, enabled: Boolean, requester: FocusRequester) {
    LaunchedEffect(key) {
        if (enabled) runCatching { requester.requestFocus() }
    }
}

// The same page for Live TV, Movies and Series: the categories on the left, and on
// the right either the favourites (shown first when there are some), a search that
// only looks at this type, or the content of a category.
@Composable
fun <T : Any> BrowsePage(
    viewModel: MainViewModel,
    kind: MediaKind,
    controller: BrowseController<T>,
    hidden: Set<String>,
    favorites: List<T>,
    searchResults: List<T>,
    idOf: (T) -> String,
    panelTitle: Int,
    countFormat: Int,
    searchHint: Int,
    onSelectCategory: (Category) -> Unit,
    onRetry: () -> Unit,
    content: @Composable (List<T>, FocusRequester) -> Unit,
) {
    val categories by controller.categories.collectAsStateWithLifecycle()
    val selected by controller.selected.collectAsStateWithLifecycle()
    val items by controller.items.collectAsStateWithLifecycle()
    val loading by controller.loading.collectAsStateWithLifecycle()
    val error by controller.error.collectAsStateWithLifecycle()
    val query by viewModel.searchQuery.collectAsStateWithLifecycle()
    val searchLoading by viewModel.searchLoading.collectAsStateWithLifecycle()
    var mode by remember {
        mutableStateOf(
            viewModel.browseMode(kind)?.let { BrowseMode.values().getOrNull(it) }
                ?: if (favorites.isNotEmpty()) BrowseMode.FAVORITES else BrowseMode.CATEGORY
        )
    }

    fun changeMode(newMode: BrowseMode) {
        mode = newMode
        viewModel.rememberBrowseMode(kind, newMode.ordinal)
    }
    val firstFocus = remember { FocusRequester() }
    val searchFocus = remember { FocusRequester() }

    val shown = when (mode) {
        BrowseMode.FAVORITES -> favorites
        BrowseMode.SEARCH -> searchResults
        BrowseMode.CATEGORY -> items
    }

    FocusFirstWhen(
        key = Pair(mode, shown.firstOrNull()?.let(idOf)),
        enabled = mode != BrowseMode.SEARCH && shown.isNotEmpty(),
        requester = firstFocus,
    )

    // On entering the search, the cursor goes to the text field (not when coming back
    // from a result: the typed text and the results are still there).
    LaunchedEffect(mode) {
        if (mode == BrowseMode.SEARCH && query.isEmpty()) {
            runCatching { searchFocus.requestFocus() }
        }
    }

    Row(
        modifier = Modifier
            .fillMaxSize()
            .padding(start = 48.dp, end = 48.dp, bottom = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(22.dp),
    ) {
        CategoryPanel(
            title = stringResource(panelTitle),
            categories = categories,
            hidden = hidden,
            mode = mode,
            selectedId = selected?.id,
            onFavorites = { changeMode(BrowseMode.FAVORITES) },
            onSearch = {
                changeMode(BrowseMode.SEARCH)
                viewModel.beginSearch(kind)
            },
            onSelect = {
                changeMode(BrowseMode.CATEGORY)
                onSelectCategory(it)
            },
            modifier = Modifier.width(250.dp),
        )

        Column(modifier = Modifier.weight(1f)) {
            val title = when (mode) {
                BrowseMode.FAVORITES -> stringResource(R.string.browse_favorites)
                BrowseMode.SEARCH -> stringResource(R.string.browse_search)
                BrowseMode.CATEGORY -> selected?.let { displayName(it.name) } ?: stringResource(panelTitle)
            }

            ListHeader(
                title = title,
                count = if (shown.isEmpty()) "" else stringResource(countFormat, shown.size),
            )

            if (mode == BrowseMode.SEARCH) {
                OutlinedTextField(
                    value = query,
                    onValueChange = { viewModel.setSearchQuery(kind, it) },
                    label = { Text(stringResource(searchHint)) },
                    leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    modifier = Modifier
                        .fillMaxWidth()
                        .focusRequester(searchFocus),
                )

                Spacer(Modifier.height(10.dp))
            }

            val failure = error

            when {
                mode == BrowseMode.CATEGORY && failure != null -> MessageBlock(
                    title = stringResource(R.string.error_load_title),
                    hint = failure.errorText(),
                    actionLabel = stringResource(R.string.common_retry),
                    onAction = onRetry,
                )

                mode == BrowseMode.CATEGORY && loading && items.isEmpty() ->
                    MessageBlock(stringResource(R.string.common_loading), "")

                shown.isEmpty() -> when (mode) {
                    BrowseMode.FAVORITES -> MessageBlock(
                        stringResource(R.string.fav_empty_title),
                        stringResource(R.string.fav_empty_hint),
                    )
                    BrowseMode.SEARCH -> when {
                        query.trim().length < 2 -> MessageBlock(
                            stringResource(R.string.browse_search),
                            stringResource(R.string.search_type_more),
                        )
                        kind in searchLoading -> MessageBlock(
                            stringResource(R.string.common_loading),
                            stringResource(R.string.search_loading_hint),
                        )
                        else -> MessageBlock(
                            stringResource(R.string.search_none),
                            stringResource(R.string.search_none_hint),
                        )
                    }
                    BrowseMode.CATEGORY -> MessageBlock(stringResource(R.string.browse_empty), "")
                }

                else -> content(shown, firstFocus)
            }
        }
    }
}
