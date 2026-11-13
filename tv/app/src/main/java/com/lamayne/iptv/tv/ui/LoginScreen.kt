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
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.material3.IconButton
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lamayne.iptv.tv.MainViewModel
import com.lamayne.iptv.tv.R

@Composable
fun LoginScreen(viewModel: MainViewModel) {
    val busy by viewModel.loginBusy.collectAsStateWithLifecycle()
    val error by viewModel.loginError.collectAsStateWithLifecycle()
    var server by rememberSaveable { mutableStateOf("") }
    var user by rememberSaveable { mutableStateOf("") }
    var pass by rememberSaveable { mutableStateOf("") }
    var mode by rememberSaveable { mutableStateOf(0) }
    var m3u by rememberSaveable { mutableStateOf("") }
    var showPass by rememberSaveable { mutableStateOf(false) }
    val eyeFocus = remember { FocusRequester() }
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
                stringResource(R.string.login_title),
                color = TextMain,
                fontSize = 26.sp,
                fontWeight = FontWeight.SemiBold,
            )

            Spacer(Modifier.height(4.dp))

            Text(stringResource(R.string.login_subtitle), color = Muted, fontSize = 15.sp)

            Spacer(Modifier.height(20.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill(stringResource(R.string.login_mode_xtream), mode == 0, onClick = { mode = 0 })
                Pill(stringResource(R.string.login_mode_m3u), mode == 1, onClick = { mode = 1 })
            }

            Spacer(Modifier.height(14.dp))

            if (mode == 0) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = server,
                    onValueChange = { server = it },
                    label = { Text(stringResource(R.string.login_server)) },
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
                    label = { Text(stringResource(R.string.login_user)) },
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

                // The password and its eye side by side: Right on the field goes to the eye.
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = pass,
                        onValueChange = { pass = it },
                        label = { Text(stringResource(R.string.login_pass)) },
                        singleLine = true,
                        // dots instead of letters, unless the eye is pressed
                        visualTransformation = if (showPass) VisualTransformation.None else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done,
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = { focusManager.moveFocus(FocusDirection.Down) },
                        ),
                        modifier = Modifier
                            .weight(1f)
                            .onPreviewKeyEvent { event ->
                                // a text field keeps the arrows for its cursor: this one gives way
                                if (event.type == KeyEventType.KeyDown && event.key == Key.DirectionRight) {
                                    runCatching { eyeFocus.requestFocus() }
                                    true
                                } else {
                                    false
                                }
                            },
                    )

                    Spacer(Modifier.width(10.dp))

                    EyeButton(visible = showPass, focusRequester = eyeFocus, onClick = { showPass = !showPass })
                }
            }
            } else {
                OutlinedTextField(
                    value = m3u,
                    onValueChange = { m3u = it },
                    label = { Text(stringResource(R.string.login_m3u_label)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Uri,
                        imeAction = ImeAction.Done,
                    ),
                    keyboardActions = KeyboardActions(
                        onDone = { focusManager.moveFocus(FocusDirection.Down) },
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            Spacer(Modifier.height(20.dp))

            error?.let { failure ->
                Text(failure.errorText(), color = Danger, fontSize = 15.sp)
                Spacer(Modifier.height(12.dp))
            }

            FocusCard(
                onClick = {
                    if (!busy) {
                        if (mode == 0) viewModel.login(server, user, pass) else viewModel.loginM3u(m3u)
                    }
                },
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
                        stringResource(if (busy) R.string.login_connecting else R.string.login_connect),
                        color = Color.White,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            Spacer(Modifier.height(16.dp))

            Text(
                stringResource(if (mode == 0) R.string.login_tip else R.string.login_m3u_tip),
                color = Muted,
                fontSize = 13.sp,
            )
        }
    }
}
