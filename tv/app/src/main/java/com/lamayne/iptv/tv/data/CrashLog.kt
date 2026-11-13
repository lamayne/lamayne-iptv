package com.lamayne.iptv.tv.data

import android.content.Context
import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// If the app closes by itself, the reason is written to a file (Settings shows it), so
// a crash that cannot be reproduced can still be understood. Nothing is sent anywhere.
object CrashLog {
    private const val FILE = "last-crash.txt"

    fun install(context: Context) {
        val app = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()

        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            try {
                val runtime = Runtime.getRuntime()
                val usedMb = (runtime.totalMemory() - runtime.freeMemory()) / 1_048_576
                val maxMb = runtime.maxMemory() / 1_048_576
                val stack = Log.getStackTraceString(error).lines().take(40).joinToString("\n")
                val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())

                File(app.filesDir, FILE).writeText("$stamp  thread ${thread.name}\nMemory: $usedMb / $maxMb MB\n$stack")
            } catch (ignored: Throwable) {
                // nothing more can be done
            }

            previous?.uncaughtException(thread, error)
        }
    }

    fun read(context: Context): String? {
        val file = File(context.filesDir, FILE)

        return if (file.exists()) file.readText().takeIf { it.isNotBlank() } else null
    }

    fun clear(context: Context) {
        File(context.filesDir, FILE).delete()
    }
}
