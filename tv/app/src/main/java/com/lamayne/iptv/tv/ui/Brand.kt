package com.lamayne.iptv.tv.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lamayne.iptv.tv.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// The emblem without its grey tile. The picture of the repository has the tile in
// it: the grey that touches the edges is removed (flood fill from the border), so the
// logo sits straight on any background.
object Emblem {
    @Volatile
    private var cached: ImageBitmap? = null

    fun peek(): ImageBitmap? = cached

    suspend fun load(context: Context): ImageBitmap? {
        cached?.let { return it }

        return withContext(Dispatchers.Default) {
            val resources = context.resources
            val real = resources.getIdentifier("lamayne_emblem", "drawable", context.packageName)
            val spare = resources.getIdentifier("emblem_fallback", "drawable", context.packageName)
            val resId = if (real != 0) real else spare

            if (resId == 0) return@withContext null

            val options = BitmapFactory.Options().apply {
                inScaled = false
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }
            val decoded = BitmapFactory.decodeResource(resources, resId, options) ?: return@withContext null
            val sized = if (decoded.width > 512) {
                Bitmap.createScaledBitmap(decoded, 512, 512 * decoded.height / decoded.width, true)
            } else {
                decoded
            }
            val result = if (real != 0) removeBackdrop(sized) else sized
            val image = result.asImageBitmap()

            cached = image

            image
        }
    }

    private fun isBackdrop(color: Int): Boolean {
        val alpha = color ushr 24

        if (alpha < 20) return true

        val r = (color shr 16) and 255
        val g = (color shr 8) and 255
        val b = color and 255
        val max = maxOf(r, g, b)
        val min = minOf(r, g, b)

        // light and almost grey
        return max > 95 && (max - min) * 100 < 16 * max
    }

    private fun removeBackdrop(source: Bitmap): Bitmap {
        val w = source.width
        val h = source.height
        val pixels = IntArray(w * h)

        source.getPixels(pixels, 0, w, 0, 0, w, h)

        val seen = BooleanArray(w * h)
        val stack = IntArray(w * h)
        var top = 0

        fun push(x: Int, y: Int) {
            if (x < 0 || y < 0 || x >= w || y >= h) return

            val index = y * w + x

            if (seen[index] || !isBackdrop(pixels[index])) return

            seen[index] = true
            stack[top++] = index
        }

        for (x in 0 until w) {
            push(x, 0)
            push(x, h - 1)
        }

        for (y in 0 until h) {
            push(0, y)
            push(w - 1, y)
        }

        while (top > 0) {
            val index = stack[--top]
            val x = index % w
            val y = index / w

            pixels[index] = 0
            push(x + 1, y)
            push(x - 1, y)
            push(x, y + 1)
            push(x, y - 1)
        }

        return Bitmap.createBitmap(pixels, w, h, Bitmap.Config.ARGB_8888)
    }
}

// The app logo, on a transparent background.
@Composable
fun BrandMark(size: Dp) {
    val context = LocalContext.current
    var emblem by remember { mutableStateOf(Emblem.peek()) }

    LaunchedEffect(Unit) {
        if (emblem == null) emblem = Emblem.load(context)
    }

    val image = emblem

    if (image != null) {
        Image(
            bitmap = image,
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = Modifier.size(size),
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

// The screen shown at launch: the logo, big, that grows in, with a light that
// breathes behind it and a loading bar.
@Composable
fun SplashScreen() {
    val scale = remember { Animatable(0.5f) }
    val alpha = remember { Animatable(0f) }
    val infinite = rememberInfiniteTransition(label = "splash")
    val glow by infinite.animateFloat(
        initialValue = 0.35f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1500, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "glow",
    )
    val sweep by infinite.animateFloat(
        initialValue = -0.45f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1250, easing = LinearEasing)),
        label = "sweep",
    )

    LaunchedEffect(Unit) {
        launch { alpha.animateTo(1f, tween(650)) }
        scale.animateTo(1f, spring(dampingRatio = 0.5f, stiffness = 110f))
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Bg),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Brush.radialGradient(listOf(Accent.copy(alpha = 0.38f * glow), Color.Transparent))),
        )

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier.graphicsLayer {
                    scaleX = scale.value
                    scaleY = scale.value
                    this.alpha = alpha.value
                },
            ) {
                BrandMark(230.dp)
            }

            Spacer(Modifier.height(18.dp))

            Text(
                "LAMAYNE",
                color = Color.White.copy(alpha = alpha.value),
                fontSize = 46.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 12.sp,
            )

            Text(
                "IPTV",
                color = AccentBright.copy(alpha = alpha.value),
                fontSize = 20.sp,
                fontWeight = FontWeight.Medium,
                letterSpacing = 16.sp,
            )

            Spacer(Modifier.height(34.dp))

            Canvas(modifier = Modifier.width(280.dp).height(4.dp)) {
                val radius = CornerRadius(size.height / 2, size.height / 2)

                drawRoundRect(Color(0x22FFFFFF), cornerRadius = radius)

                clipRect {
                    drawRoundRect(
                        brush = Brush.horizontalGradient(listOf(Accent, AccentBright)),
                        topLeft = Offset(sweep * size.width, 0f),
                        size = Size(size.width * 0.45f, size.height),
                        cornerRadius = radius,
                    )
                }
            }

            Spacer(Modifier.height(14.dp))

            Text(stringResource(R.string.splash_loading), color = Muted, fontSize = 14.sp)
        }
    }
}
