package com.lamayne.iptv.tv.ui

import android.graphics.Bitmap
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter

// A QR code to scan with a phone: most TVs have no web browser to open a link.
object Qr {
    fun make(text: String, size: Int = 360): ImageBitmap? =
        try {
            val matrix = QRCodeWriter().encode(
                text,
                BarcodeFormat.QR_CODE,
                size,
                size,
                mapOf(EncodeHintType.MARGIN to 1),
            )
            val pixels = IntArray(size * size)

            for (y in 0 until size) {
                for (x in 0 until size) {
                    pixels[y * size + x] = if (matrix.get(x, y)) 0xFF0A0A12.toInt() else 0xFFFFFFFF.toInt()
                }
            }

            Bitmap.createBitmap(pixels, size, size, Bitmap.Config.ARGB_8888).asImageBitmap()
        } catch (e: Exception) {
            null
        }
}
