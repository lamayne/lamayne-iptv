package com.lamayne.iptv.tv.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lamayne.iptv.tv.R
import com.lamayne.iptv.tv.data.Category
import com.lamayne.iptv.tv.data.Channel
import com.lamayne.iptv.tv.data.EpgInfo

// One channel as a compact line: small logo, name, what is on now and its progress.
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
            .height(68.dp),
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
            Box(
                modifier = Modifier
                    .size(width = 66.dp, height = 46.dp)
                    .clip(RoundedCornerShape(9.dp))
                    .background(LogoBg),
            ) {
                ChannelLogo(channel, Modifier.fillMaxHeight().fillMaxWidth().padding(5.dp))
            }

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

                val now = epg?.now

                Text(
                    when {
                        now != null -> now.title
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

// The list of categories on the left of the Live, Movies and Series pages.
@Composable
fun CategoryPanel(
    title: String,
    categories: List<Category>,
    hidden: Set<String>,
    selectedId: String?,
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
            itemsIndexed(visible) { _, category ->
                val selected = category.id == selectedId

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
            .padding(bottom = 12.dp, start = 4.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            title,
            color = Color.White,
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )

        Text(count, color = Muted, fontSize = 15.sp)
    }
}

// Moves the cursor onto the first element of a list when the list changes.
@Composable
fun FocusFirstWhen(key: Any?, enabled: Boolean, requester: FocusRequester) {
    LaunchedEffect(key) {
        if (enabled) runCatching { requester.requestFocus() }
    }
}
