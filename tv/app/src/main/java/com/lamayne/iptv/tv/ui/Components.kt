package com.lamayne.iptv.tv.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.lamayne.iptv.tv.data.Channel

// The base of every focusable element: it grows a little and gets a violet
// border when the remote's cursor is on it.
@Composable
fun FocusCard(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(16.dp),
    container: Color = CardBg,
    focusedContainer: Color = CardFocused,
    borderColor: Color = Accent,
    focusedScale: Float = 1.05f,
    focusRequester: FocusRequester? = null,
    onFocused: () -> Unit = {},
    content: @Composable BoxScope.(Boolean) -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(if (focused) focusedScale else 1f, label = "focusScale")
    val border by animateColorAsState(
        if (focused) borderColor else Color.Transparent,
        label = "focusBorder",
    )
    val interaction = remember { MutableInteractionSource() }

    var chain = modifier
        .graphicsLayer {
            scaleX = scale
            scaleY = scale
        }
        .clip(shape)
        .background(if (focused) focusedContainer else container)
        .border(BorderStroke(3.dp, border), shape)

    if (focusRequester != null) chain = chain.focusRequester(focusRequester)

    Box(
        modifier = chain
            .onFocusChanged { state ->
                focused = state.isFocused

                if (state.isFocused) onFocused()
            }
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClick = onClick,
            ),
    ) {
        content(focused)
    }
}

@Composable
fun RoundButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 60.dp,
    accent: Boolean = false,
    focusRequester: FocusRequester? = null,
    content: @Composable () -> Unit,
) {
    FocusCard(
        onClick = onClick,
        modifier = modifier.size(size),
        shape = CircleShape,
        container = if (accent) Accent else Color(0x33FFFFFF),
        focusedContainer = if (accent) AccentBright else Color(0x66FFFFFF),
        borderColor = Color.White,
        focusedScale = 1.12f,
        focusRequester = focusRequester,
    ) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            content()
        }
    }
}

@Composable
fun LiveBadge() {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(LiveRed)
            .padding(horizontal = 8.dp, vertical = 3.dp),
    ) {
        Text("LIVE", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
    }
}

@Composable
fun ProgressLine(fraction: Float, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .height(5.dp)
            .clip(RoundedCornerShape(3.dp))
            .background(Color(0x33FFFFFF)),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(fraction.coerceIn(0f, 1f))
                .fillMaxHeight()
                .background(Accent),
        )
    }
}

// The app emblem (copied from the repository at build time), or a drawn
// substitute when it is not there.
@Composable
fun BrandMark(size: Dp) {
    val context = LocalContext.current
    val resId = remember {
        context.resources.getIdentifier("lamayne_emblem", "drawable", context.packageName)
    }

    if (resId != 0) {
        AsyncImage(
            model = resId,
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .size(size)
                .clip(RoundedCornerShape(size * 0.22f)),
        )
    } else {
        Canvas(modifier = Modifier.size(size)) {
            val w = this.size.width
            val h = this.size.height

            drawRoundRect(
                brush = Brush.linearGradient(listOf(Color(0xFF8B5CF6), Color(0xFF4F46E5))),
                cornerRadius = CornerRadius(w * 0.22f, w * 0.22f),
            )

            val triangle = Path().apply {
                moveTo(w * 0.38f, h * 0.28f)
                lineTo(w * 0.74f, h * 0.5f)
                lineTo(w * 0.38f, h * 0.72f)
                close()
            }

            drawPath(triangle, Color.White)
        }
    }
}

@Composable
fun Wordmark() {
    Column {
        Text("LAMAYNE", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold, letterSpacing = 4.sp)
        Text("IPTV", color = Muted, fontSize = 12.sp, fontWeight = FontWeight.Medium, letterSpacing = 6.sp)
    }
}

// A channel logo, or its initials on a coloured tile when there is no logo
// (or it cannot be loaded).
@Composable
fun ChannelLogo(channel: Channel, modifier: Modifier = Modifier) {
    var failed by remember(channel.icon) { mutableStateOf(false) }
    val icon = channel.icon

    if (icon != null && !failed) {
        AsyncImage(
            model = icon,
            contentDescription = null,
            contentScale = ContentScale.Fit,
            onError = { failed = true },
            modifier = modifier,
        )
    } else {
        Box(modifier = modifier, contentAlignment = Alignment.Center) {
            Box(
                modifier = Modifier
                    .size(54.dp)
                    .clip(RoundedCornerShape(15.dp))
                    .background(Brush.linearGradient(listOf(Color(0xFF5B3FD0), Color(0xFF3730A3)))),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    initials(channel.name),
                    color = Color.White,
                    fontSize = 19.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

// ------------------------------------------------------------------ icons

@Composable
fun PauseGlyph(color: Color, glyphSize: Dp) {
    Canvas(modifier = Modifier.size(glyphSize)) {
        val w = this.size.width
        val h = this.size.height

        drawRoundRect(
            color = color,
            topLeft = Offset(w * 0.24f, h * 0.18f),
            size = Size(w * 0.19f, h * 0.64f),
            cornerRadius = CornerRadius(w * 0.04f, w * 0.04f),
        )
        drawRoundRect(
            color = color,
            topLeft = Offset(w * 0.57f, h * 0.18f),
            size = Size(w * 0.19f, h * 0.64f),
            cornerRadius = CornerRadius(w * 0.04f, w * 0.04f),
        )
    }
}

@Composable
fun SkipGlyph(forward: Boolean, color: Color, glyphSize: Dp) {
    Canvas(modifier = Modifier.size(glyphSize)) {
        val w = this.size.width
        val h = this.size.height
        val triangle = Path().apply {
            if (forward) {
                moveTo(w * 0.22f, h * 0.2f)
                lineTo(w * 0.68f, h * 0.5f)
                lineTo(w * 0.22f, h * 0.8f)
            } else {
                moveTo(w * 0.78f, h * 0.2f)
                lineTo(w * 0.32f, h * 0.5f)
                lineTo(w * 0.78f, h * 0.8f)
            }
            close()
        }

        drawPath(triangle, color)
        drawRoundRect(
            color = color,
            topLeft = Offset(if (forward) w * 0.72f else w * 0.2f, h * 0.2f),
            size = Size(w * 0.08f, h * 0.6f),
            cornerRadius = CornerRadius(w * 0.03f, w * 0.03f),
        )
    }
}
