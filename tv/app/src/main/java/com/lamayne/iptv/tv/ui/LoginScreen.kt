package com.lamayne.iptv.tv.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lamayne.iptv.tv.MainViewModel

@Composable
fun LoginScreen(viewModel: MainViewModel) {
    val busy by viewModel.busy.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    var server by rememberSaveable { mutableStateOf("") }
    var user by rememberSaveable { mutableStateOf("") }
    var pass by rememberSaveable { mutableStateOf("") }
    val focusManager = LocalFocusManager.current

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier
                .widthIn(max = 640.dp)
                .clip(RoundedCornerShape(28.dp))
                .background(Color(0xCC13131F))
                .padding(horizontal = 40.dp, vertical = 32.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                BrandMark(56.dp)
                Spacer(Modifier.width(16.dp))
                Wordmark()
            }

            Spacer(Modifier.height(20.dp))

            Text(
                "Connect your IPTV account",
                color = TextMain,
                fontSize = 26.sp,
                fontWeight = FontWeight.SemiBold,
            )

            Spacer(Modifier.height(4.dp))

            Text(
                "Use the details your provider gave you (Xtream Codes).",
                color = Muted,
                fontSize = 15.sp,
            )

            Spacer(Modifier.height(20.dp))

            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = server,
                    onValueChange = { server = it },
                    label = { Text("Server address, e.g. http://host:8080") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Uri,
                        imeAction = ImeAction.Next,
                    ),
                    keyboardActions = KeyboardActions(
                        onNext = { focusManager.moveFocus(FocusDirection.Down) },
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )

                OutlinedTextField(
                    value = user,
                    onValueChange = { user = it },
                    label = { Text("Username") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Ascii,
                        imeAction = ImeAction.Next,
                    ),
                    keyboardActions = KeyboardActions(
                        onNext = { focusManager.moveFocus(FocusDirection.Down) },
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )

                OutlinedTextField(
                    value = pass,
                    onValueChange = { pass = it },
                    label = { Text("Password") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Ascii,
                        imeAction = ImeAction.Done,
                    ),
                    keyboardActions = KeyboardActions(
                        onDone = { focusManager.moveFocus(FocusDirection.Down) },
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            Spacer(Modifier.height(20.dp))

            error?.let { message ->
                Text(message, color = Danger, fontSize = 15.sp)
                Spacer(Modifier.height(12.dp))
            }

            FocusCard(
                onClick = { if (!busy) viewModel.login(server, user, pass) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                container = Accent,
                focusedContainer = AccentBright,
                borderColor = Color.White,
                focusedScale = 1.03f,
            ) {
                Box(modifier = Modifier.fillMaxWidth().height(56.dp), contentAlignment = Alignment.Center) {
                    Text(
                        if (busy) "Connecting..." else "Connect",
                        color = Color.White,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            Spacer(Modifier.height(16.dp))

            Text(
                "Tip: in the Google TV phone app, open the remote and type with your phone keyboard.",
                color = Muted,
                fontSize = 13.sp,
            )
        }
    }
}
