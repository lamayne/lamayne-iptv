package com.lamayne.iptv.tv.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// An eye (the password is shown) or a crossed-out eye (it is hidden). Drawn here because the
// extended icon set is not part of the app.
@Composable
fun EyeGlyph(open: Boolean, color: Color = Color(0xFFB8B8CC), glyphSize: Dp = 26.dp) {
    Canvas(modifier = Modifier.size(glyphSize)) {
        val w = size.width
        val h = size.height
        val stroke = Stroke(width = w * 0.09f, cap = StrokeCap.Round)

        // the outline of the eye
        val outline = Path().apply {
            moveTo(w * 0.06f, h * 0.5f)
            quadraticBezierTo(w * 0.5f, h * 0.06f, w * 0.94f, h * 0.5f)
            quadraticBezierTo(w * 0.5f, h * 0.94f, w * 0.06f, h * 0.5f)
            close()
        }

        drawPath(outline, color, style = stroke)
        drawCircle(color, radius = w * 0.14f, center = Offset(w * 0.5f, h * 0.5f))

        // crossed out when the password is hidden
        if (!open) {
            drawLine(
                color = color,
                start = Offset(w * 0.18f, h * 0.84f),
                end = Offset(w * 0.82f, h * 0.16f),
                strokeWidth = w * 0.09f,
                cap = StrokeCap.Round,
            )
        }
    }
}
