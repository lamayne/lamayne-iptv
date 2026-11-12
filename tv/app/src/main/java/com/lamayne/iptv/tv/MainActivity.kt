package com.lamayne.iptv.tv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import com.lamayne.iptv.tv.ui.LamayneApp
import com.lamayne.iptv.tv.ui.LamayneTheme

class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
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
