
package com.example.tvversionmanager

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.tvversionmanager.data.PackageRepository
import com.example.tvversionmanager.model.VersionRelation
import com.example.tvversionmanager.viewmodel.MainViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val Bg = Color(0xFF0B1018)
private val Panel = Color(0xFF121B28)
private val PanelLight = Color(0xFF182436)
private val Blue = Color(0xFF3987F6)
private val TextMain = Color(0xFFF1F5FB)
private val TextMuted = Color(0xFF9EADC2)
private val Green = Color(0xFF54D6A0)
private val Orange = Color(0xFFFFB454)
private val Red = Color(0xFFFF7777)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            TVManagerScreen()
        }
    }
}

@Composable
private fun TVManagerScreen(vm: MainViewModel = viewModel()) {
    val state by vm.state.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var confirmDowngrade by remember { mutableStateOf(false) }

    val installPermissionLauncher =
        rememberLauncherForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) {
            vm.refreshAfterInstall()
        }

    val installerLauncher =
        rememberLauncherForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) {
            vm.refreshAfterInstall()
        }

    val uninstallLauncher =
        rememberLauncherForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) {
            scope.launch {
                var removed = false

                // Android puede tardar en actualizar el estado del paquete.
                for (attempt in 0 until 10) {
                    if (!vm.isTargetInstalled()) {
                        removed = true
                        break
                    }
                    delay(500)
                }

                if (removed) {
                    val intent = vm.installerIntent()
                    if (intent != null) {
                        installerLauncher.launch(intent)
                    } else {
                        Toast.makeText(
                            context,
                            "Revisa el permiso para instalar aplicaciones desconocidas.",
                            Toast.LENGTH_LONG
                        ).show()
                    }
                } else {
                    vm.refreshAfterInstall()
                    Toast.makeText(
                        context,
                        "La aplicación sigue instalada. Comprueba la confirmación de Android.",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }

    LaunchedEffect(Unit) {
        vm.check()
    }

    val statusColor = when (state.relation) {
        VersionRelation.SAME -> Green
        VersionRelation.OLDER, VersionRelation.MISSING -> Blue
        VersionRelation.NEWER -> Orange
        VersionRelation.UNKNOWN -> Red
    }

    val currentProgress = state.progress

    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Blue,
            background = Bg,
            surface = Panel,
            onBackground = TextMain,
            onSurface = TextMain
        )
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = Bg
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 24.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp)
            ) {
                // Encabezado y logo original
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    TVLogo()

                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                "TV",
                                color = Blue,
                                fontSize = 25.sp,
                                fontWeight = FontWeight.ExtraBold
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                "Version Manager",
                                color = TextMain,
                                fontSize = 21.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "Control de versiones",
                            color = TextMuted,
                            fontSize = 13.sp
                        )
                    }
                }

                // Información de la aplicación
                SectionCard {
                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    "Aplicación objetivo",
                                    color = TextMuted,
                                    fontSize = 12.sp
                                )
                                Spacer(Modifier.height(5.dp))
                                Text(
                                    state.installed?.label ?: "MAGIS TV / XUPER TV",
                                    color = TextMain,
                                    fontSize = 20.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }

                            StatusPill(
                                text = when (state.relation) {
                                    VersionRelation.SAME -> "Correcta"
                                    VersionRelation.OLDER -> "Anterior"
                                    VersionRelation.NEWER -> "Superior"
                                    VersionRelation.MISSING -> "No instalada"
                                    VersionRelation.UNKNOWN -> "Sin verificar"
                                },
                                color = statusColor
                            )
                        }

                        Text(
                            PackageRepository.TARGET_PACKAGE,
                            color = TextMuted,
                            fontSize = 12.sp
                        )

                        HorizontalDivider(color = Color(0xFF263449))

                        VersionRow(
                            label = "Versión instalada",
                            value = state.installed?.versionName ?: "No detectada"
                        )

                        VersionRow(
                            label = "Versión objetivo",
                            value = PackageRepository.TARGET_VERSION,
                            valueColor = Blue
                        )
                    }
                }

                // Estado actual
                SectionCard {
                    Row(
                        verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(38.dp)
                                .clip(CircleShape)
                                .background(statusColor.copy(alpha = 0.13f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                when (state.relation) {
                                    VersionRelation.SAME -> "✓"
                                    VersionRelation.NEWER -> "!"
                                    VersionRelation.OLDER -> "↓"
                                    VersionRelation.MISSING -> "+"
                                    VersionRelation.UNKNOWN -> "?"
                                },
                                color = statusColor,
                                fontSize = 21.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(5.dp)
                        ) {
                            Text(
                                when (state.relation) {
                                    VersionRelation.SAME -> "Todo está al día"
                                    VersionRelation.OLDER -> "Actualización disponible"
                                    VersionRelation.NEWER -> "Versión superior detectada"
                                    VersionRelation.MISSING -> "Aplicación no encontrada"
                                    VersionRelation.UNKNOWN -> "No se pudo verificar"
                                },
                                color = statusColor,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.SemiBold
                            )

                            Text(
                                state.message,
                                color = TextMuted,
                                fontSize = 13.sp,
                                lineHeight = 19.sp
                            )
                        }
                    }
                }

                // Descarga y validación
                SectionCard {
                    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    "Archivo de instalación",
                                    color = TextMain,
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    when {
                                        state.busy -> "Descargando APK…"
                                        currentProgress == 100 -> "Descarga completada"
                                        state.error != null -> "No se pudo completar"
                                        else -> "Listo para descargar"
                                    },
                                    color = TextMuted,
                                    fontSize = 13.sp
                                )
                            }

                            Text(
                                if (state.busy && currentProgress != null) {
                                    "$currentProgress%"
                                } else if (currentProgress == 100) {
                                    "100%"
                                } else {
                                    "APK"
                                },
                                color = if (currentProgress == 100) Green else Blue,
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 13.sp
                            )
                        }

                        if (state.busy) {
                            if (currentProgress != null) {
                                LinearProgressIndicator(
                                    progress = { currentProgress / 100f },
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(5.dp)
                                        .clip(CircleShape)
                                )
                            } else {
                                LinearProgressIndicator(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(5.dp)
                                        .clip(CircleShape)
                                )
                            }

                            Text(
                                "Descargado: ${state.downloadedBytes / 1024} KB" +
                                    (currentProgress?.let { " · $it%" } ?: ""),
                                color = TextMuted,
                                fontSize = 12.sp
                            )

                            OutlinedButton(
                                onClick = vm::cancelDownload,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text("Cancelar descarga")
                            }
                        }

                        if (currentProgress == 100 && !state.busy) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Text(
                                    "✓",
                                    color = Green,
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    "APK descargado y validado",
                                    color = Green,
                                    fontSize = 13.sp
                                )
                            }
                        }

                        state.error?.let { error ->
                            Text(
                                error,
                                color = Red,
                                fontSize = 13.sp,
                                lineHeight = 18.sp
                            )
                        }
                    }
                }

                // Acción principal según el estado de la app
                when (state.relation) {
                    VersionRelation.OLDER,
                    VersionRelation.MISSING -> {
                        Button(
                            onClick = {
                                if (currentProgress == 100) {
                                    vm.installerIntent()?.let(installerLauncher::launch)
                                } else {
                                    vm.download()
                                }
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(54.dp),
                            enabled = !state.busy,
                            shape = RoundedCornerShape(14.dp)
                        ) {
                            Text(
                                if (currentProgress == 100) {
                                    "Instalar versión ${PackageRepository.TARGET_VERSION}"
                                } else {
                                    "Descargar versión ${PackageRepository.TARGET_VERSION}"
                                },
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }

                    VersionRelation.NEWER -> {
                        Button(
                            onClick = {
                                if (currentProgress == 100) {
                                    uninstallLauncher.launch(vm.uninstallTargetIntent())
                                } else {
                                    confirmDowngrade = true
                                }
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(54.dp),
                            enabled = !state.busy,
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Blue
                            )
                        ) {
                            Text(
                                if (currentProgress == 100) {
                                    "Desinstalar e instalar ${PackageRepository.TARGET_VERSION}"
                                } else {
                                    "Volver a la versión ${PackageRepository.TARGET_VERSION}"
                                },
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }

                    VersionRelation.SAME -> {
                        OutlinedButton(
                            onClick = vm::check,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(50.dp),
                            shape = RoundedCornerShape(14.dp)
                        ) {
                            Text("Volver a comprobar")
                        }
                    }

                    VersionRelation.UNKNOWN -> {
                        Button(
                            onClick = vm::check,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(50.dp),
                            shape = RoundedCornerShape(14.dp)
                        ) {
                            Text("Comprobar aplicación")
                        }
                    }
                }

                // Permisos de instalación
                if (state.installPermissionNeeded) {
                    SectionCard {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(
                                "Permiso de instalación necesario",
                                color = Orange,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                "Permite instalar aplicaciones desde TV Version Manager en los ajustes de Android.",
                                color = TextMuted,
                                fontSize = 13.sp,
                                lineHeight = 19.sp
                            )
                            Button(
                                onClick = {
                                    installPermissionLauncher.launch(
                                        vm.installPermissionIntent()
                                    )
                                },
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text("Abrir ajustes")
                            }
                        }
                    }
                }

                // Acciones secundarias
                OutlinedButton(
                    onClick = vm::check,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(14.dp),
                    enabled = !state.busy
                ) {
                    Text("Volver a comprobar")
                }

                HorizontalDivider(color = Color(0xFF263449))

                Text(
                    "La instalación y desinstalación requieren confirmación de Android. " +
                        "Si vuelves a una versión anterior, es posible que se borren los datos " +
                        "locales de la aplicación.",
                    color = TextMuted,
                    fontSize = 11.sp,
                    lineHeight = 17.sp
                )

                Spacer(Modifier.height(8.dp))
            }
        }
    }

    if (confirmDowngrade) {
        AlertDialog(
            onDismissRequest = { confirmDowngrade = false },
            containerColor = Panel,
            title = {
                Text(
                    "Volver a una versión anterior",
                    color = TextMain
                )
            },
            text = {
                Text(
                    "Se descargará y validará la versión ${PackageRepository.TARGET_VERSION}. " +
                        "Después tendrás que confirmar la desinstalación de la versión actual " +
                        "y la instalación del APK. Es posible que pierdas datos locales. ¿Continuar?",
                    color = TextMuted
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmDowngrade = false
                        vm.download()
                    }
                ) {
                    Text("Continuar")
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmDowngrade = false }) {
                    Text("Cancelar")
                }
            }
        )
    }
}

@Composable
private fun TVLogo() {
    Box(
        modifier = Modifier
            .size(58.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(PanelLight),
        contentAlignment = Alignment.Center
    ) {
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .padding(8.dp)
        ) {
            val stroke = 2.5.dp.toPx()
            val centerX = size.width / 2f

            // Antenas
            drawLine(
                Blue,
                Offset(centerX - 5.dp.toPx(), 10.dp.toPx()),
                Offset(centerX - 12.dp.toPx(), 2.dp.toPx()),
                stroke,
                cap = StrokeCap.Round
            )
            drawLine(
                Blue,
                Offset(centerX + 5.dp.toPx(), 10.dp.toPx()),
                Offset(centerX + 12.dp.toPx(), 2.dp.toPx()),
                stroke,
                cap = StrokeCap.Round
            )
        }

        Box(
            modifier = Modifier
                .padding(top = 8.dp)
                .size(width = 38.dp, height = 29.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(Bg),
            contentAlignment = Alignment.Center
        ) {
            Text(
                "TV",
                color = TextMain,
                fontSize = 17.sp,
                fontWeight = FontWeight.ExtraBold
            )
        }
    }
}

@Composable
private fun SectionCard(content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Panel),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            content = content
        )
    }
}

@Composable
private fun VersionRow(
    label: String,
    value: String,
    valueColor: Color = TextMain
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            label,
            color = TextMuted,
            fontSize = 13.sp,
            modifier = Modifier.weight(1f)
        )
        Text(
            value,
            color = valueColor,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
private fun StatusPill(text: String, color: Color) {
    Surface(
        shape = RoundedCornerShape(50),
        color = color.copy(alpha = 0.12f)
    ) {
        Text(
            text,
            modifier = Modifier.padding(horizontal = 11.dp, vertical = 7.dp),
            color = color,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold
        )
    }
}
