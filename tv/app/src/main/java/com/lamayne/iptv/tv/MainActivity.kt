package com.lamayne.iptv.tv

import android.content.Context
import android.content.res.Configuration
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import com.lamayne.iptv.tv.data.CrashLog
import com.lamayne.iptv.tv.ui.LamayneApp
import com.lamayne.iptv.tv.ui.LamayneTheme
import java.util.Locale

// The language chosen in Settings ("system" = the language of the TV).
object LocaleHelper {
    fun wrap(context: Context): Context {
        val language = context
            .getSharedPreferences("lamayne_tv", Context.MODE_PRIVATE)
            .getString("lang", "system") ?: "system"

        if (language == "system") return context

        val locale = Locale(language)
        val configuration = Configuration(context.resources.configuration)

        Locale.setDefault(locale)
        configuration.setLocale(locale)

        return context.createConfigurationContext(configuration)
    }
}

class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels()

    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(LocaleHelper.wrap(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        CrashLog.install(this)
        super.onCreate(savedInstanceState)

        if (savedInstanceState == null) {
            viewModel.loginFromIntent(
                intent?.getStringExtra("server"),
                intent?.getStringExtra("user"),
                intent?.getStringExtra("pass"),
            )
        }

        setContent {
            LamayneTheme {
                LamayneApp(viewModel)
            }
        }
    }
}
