package com.lamayne.iptv.tv.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.lamayne.iptv.tv.R
import com.lamayne.iptv.tv.data.Channel

// A tab or a filter: text only, filled when selected.
@Composable
fun Pill(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    focusRequester: FocusRequester? = null,
) {
    FocusCard(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(50),
        container = if (selected) AccentDeep else Color.Transparent,
        focusedContainer = CardFocused,
        focusedScale = 1.06f,
        focusRequester = focusRequester,
    ) {
        Text(
            text,
            color = if (selected) Color.White else Muted,
            fontSize = 16.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            maxLines = 1,
            modifier = Modifier.padding(horizontal = 18.dp, vertical = 9.dp),
        )
    }
}

// A button with a label (and an optional icon), for the detail pages.
@Composable
fun ActionButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    primary: Boolean = false,
    focusRequester: FocusRequester? = null,
    icon: (@Composable () -> Unit)? = null,
    // In a row of equal buttons: the button takes all its place and its content is centred.
    fill: Boolean = false,
) {
    FocusCard(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        container = if (primary) Accent else Color(0x33FFFFFF),
        focusedContainer = if (primary) AccentBright else Color(0x66FFFFFF),
        borderColor = Color.White,
        focusedScale = 1.05f,
        focusRequester = focusRequester,
    ) {
        Row(
            modifier = (if (fill) Modifier.fillMaxWidth() else Modifier)
                .padding(horizontal = 22.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (icon != null) {
                icon()
                Spacer(Modifier.width(10.dp))
            }

            Text(
                text,
                color = Color.White,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(width = 4.dp, height = 18.dp)
                .background(Brush.verticalGradient(listOf(AccentBright, Accent)), RoundedCornerShape(2.dp)),
        )

        Spacer(Modifier.width(10.dp))

        Text(
            text,
            color = TextMain,
            fontSize = 19.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
fun PosterImage(
    url: String?,
    title: String,
    modifier: Modifier = Modifier,
    alignment: Alignment = Alignment.Center,
) {
    var failed by remember(url) { mutableStateOf(false) }

    if (url != null && !failed) {
        AsyncImage(
            model = url,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            alignment = alignment,
            onError = { failed = true },
            modifier = modifier,
        )
    } else {
        Box(
            modifier = modifier.background(Brush.linearGradient(listOf(Color(0xFF3A2F7A), Color(0xFF1B1B3A)))),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                initials(title),
                color = Color(0xCCFFFFFF),
                fontSize = 30.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

// A movie or series poster: the title sits on the picture, on a soft gradient.
@Composable
fun PosterCard(
    title: String,
    image: String?,
    modifier: Modifier = Modifier,
    progress: Float? = null,
    favorite: Boolean = false,
    rating: String? = null,
    caption: String? = null,
    focusRequester: FocusRequester? = null,
    onFocused: () -> Unit = {},
    onLongClick: (() -> Unit)? = null,
    onClick: () -> Unit,
) {
    FocusCard(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        focusRequester = focusRequester,
        onFocused = onFocused,
        onLongClick = onLongClick,
        focusedScale = 1.07f,
    ) {
        Box(modifier = Modifier.fillMaxWidth().aspectRatio(2f / 3f)) {
            PosterImage(image, title, Modifier.fillMaxSize())

            Box(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xEE07070D))))
                    .padding(start = 8.dp, end = 8.dp, top = 22.dp, bottom = if (progress != null) 16.dp else 8.dp),
            ) {
                Column {
                    Text(
                        title,
                        color = Color.White,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        lineHeight = 14.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )

                    if (caption != null) {
                        Text(
                            caption,
                            color = AccentBright,
                            fontSize = 9.sp,
                            lineHeight = 11.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }

            if (progress != null) {
                ProgressLine(
                    progress,
                    Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth()
                        .padding(8.dp),
                )
            }

            if (favorite) {
                Icon(
                    Icons.Filled.Favorite,
                    contentDescription = null,
                    tint = Accent,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(6.dp)
                        .size(18.dp),
                )
            }

            if (rating != null) {
                Text(
                    "\u2605 $rating",
                    color = Color.White,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(6.dp)
                        .background(Color(0xAA000000), RoundedCornerShape(6.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
        }
    }
}

// A wide picture (16:9) with a title and a progress bar: "continue watching".
@Composable
fun WideCard(
    title: String,
    subtitle: String?,
    image: String?,
    modifier: Modifier = Modifier,
    progress: Float? = null,
    onClick: () -> Unit,
) {
    FocusCard(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        focusedScale = 1.06f,
    ) {
        Column {
            Box(modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f)) {
                PosterImage(image, title, Modifier.fillMaxSize())

                if (progress != null) {
                    ProgressLine(
                        progress,
                        Modifier
                            .align(Alignment.BottomStart)
                            .fillMaxWidth()
                            .padding(8.dp),
                    )
                }
            }

            Column(modifier = Modifier.padding(start = 10.dp, end = 10.dp, top = 6.dp, bottom = 7.dp)) {
                Text(
                    title,
                    color = TextMain,
                    fontSize = 12.sp,
                    lineHeight = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )

                if (subtitle != null) {
                    // right under the title: no gap between the two lines
                    Text(
                        subtitle,
                        color = Muted,
                        fontSize = 10.sp,
                        lineHeight = 12.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

// A channel in a row of the home page: the logo straight on the card, and under it
// what is on now (the name is shown instead when the channel has no logo or no guide).
@Composable
fun ChannelTile(
    channel: Channel,
    modifier: Modifier = Modifier,
    nowTitle: String? = null,
    nowProgress: Float? = null,
    onLongClick: (() -> Unit)? = null,
    onClick: () -> Unit,
) {
    val label = channelLabel(channel.name)
    val line = nowTitle ?: label.name

    FocusCard(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        onLongClick = onLongClick,
        focusedScale = 1.06f,
    ) {
        Column {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 10f),
                contentAlignment = Alignment.Center,
            ) {
                ChannelLogo(channel, Modifier.fillMaxSize().padding(14.dp))
            }

            Text(
                line,
                color = if (nowTitle != null) TextMain else Muted,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(start = 10.dp, end = 10.dp),
            )

            if (nowProgress != null) {
                ProgressLine(nowProgress, Modifier.fillMaxWidth().padding(start = 10.dp, end = 10.dp, top = 5.dp, bottom = 9.dp))
            } else {
                Spacer(Modifier.size(9.dp))
            }
        }
    }
}

// A list of items next to each other that scrolls sideways, with its title.
@Composable
fun <T> ContentRow(
    title: String,
    list: List<T>,
    modifier: Modifier = Modifier,
    itemContent: @Composable (T) -> Unit,
) {
    if (list.isEmpty()) return

    Column(modifier = modifier.padding(top = 10.dp)) {
        SectionTitle(title, Modifier.padding(start = 48.dp, bottom = 6.dp))

        androidx.compose.foundation.lazy.LazyRow(
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 48.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            items(list.size) { index -> itemContent(list[index]) }
        }
    }
}

@Composable
fun MessageBlock(
    title: String,
    hint: String,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: () -> Unit = {},
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, color = TextMain, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)

        if (hint.isNotEmpty()) {
            Spacer(Modifier.size(8.dp))
            Text(hint, color = Muted, fontSize = 16.sp)
        }

        if (actionLabel != null) {
            Spacer(Modifier.size(18.dp))
            ActionButton(text = actionLabel, onClick = onAction, primary = true)
        }
    }
}

@Composable
fun FullScreenMessage(title: String, hint: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        MessageBlock(title = title, hint = hint)
    }
}
