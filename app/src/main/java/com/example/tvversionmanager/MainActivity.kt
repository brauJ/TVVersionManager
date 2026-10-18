
package com.example.tvversionmanager

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.tvversionmanager.data.PackageRepository
import com.example.tvversionmanager.model.VersionRelation
import com.example.tvversionmanager.viewmodel.MainViewModel

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

    // Abre el desinstalador de Android.
    // Después de regresar, verifica si la aplicación fue desinstalada.
    val uninstallLauncher =
        rememberLauncherForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) {
            if (!vm.isTargetInstalled()) {
                vm.installerIntent()?.let(installerLauncher::launch)
            } else {
                vm.refreshAfterInstall()
            }
        }

    LaunchedEffect(Unit) {
        vm.check()
    }

    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Color(0xFF4DA3FF),
            background = Color(0xFF101318),
            surface = Color(0xFF1A2029)
        )
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = Color(0xFF101318)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Text(
                    text = "TV Version Manager",
                    style = MaterialTheme.typography.headlineMedium,
                    color = Color.White
                )

                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = Color(0xFF1A2029)
                    )
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(18.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = "Aplicación objetivo",
                            style = MaterialTheme.typography.titleMedium,
                            color = Color.White
                        )

                        Text(
                            text = "Paquete: ${PackageRepository.TARGET_PACKAGE}",
                            color = Color.LightGray
                        )

                        Text(
                            text = "Nombre detectado: ${
                                state.installed?.label
                                    ?: if (state.relation == VersionRelation.MISSING) {
                                        "No instalada"
                                    } else {
                                        "Buscando…"
                                    }
                            }",
                            color = Color.White
                        )

                        Text(
                            text = "Versión instalada: ${state.installed?.versionName ?: "—"}",
                            color = Color.White
                        )

                        Text(
                            text = "Versión objetivo: ${PackageRepository.TARGET_VERSION}",
                            color = Color.White
                        )
                    }
                }

                val statusColor = when (state.relation) {
                    VersionRelation.SAME -> Color(0xFF55D68B)
                    VersionRelation.OLDER,
                    VersionRelation.MISSING -> Color(0xFF4DA3FF)
                    VersionRelation.NEWER -> Color(0xFFFFB74D)
                    VersionRelation.UNKNOWN -> Color(0xFFFF6B6B)
                }

                Text(
                    text = state.message,
                    color = statusColor,
                    style = MaterialTheme.typography.bodyLarge
                )

                val currentProgress = state.progress

                if (state.busy) {
                    if (currentProgress != null) {
                        LinearProgressIndicator(
                            progress = { currentProgress / 100f },
                            modifier = Modifier.fillMaxWidth()
                        )
                    } else {
                        LinearProgressIndicator(
                            modifier = Modifier.fillMaxWidth()
                        )
                    }

                    Text(
                        text = "Descargado: ${state.downloadedBytes / 1024} KB" +
                            (currentProgress?.let { " · $it%" } ?: ""),
                        color = Color.LightGray
                    )

                    Button(
                        onClick = vm::cancelDownload,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Cancelar descarga")
                    }
                }

                state.error?.let { errorMessage ->
                    Text(
                        text = errorMessage,
                        color = Color(0xFFFF6B6B)
                    )
                }

                if (state.installPermissionNeeded) {
                    Text(
                        text = "Permite instalar aplicaciones desde TV Version Manager en Ajustes y vuelve aquí.",
                        color = Color(0xFFFFB74D)
                    )

                    Button(
                        onClick = {
                            installPermissionLauncher.launch(
                                vm.installPermissionIntent()
                            )
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Abrir ajustes de instalación")
                    }
                }

                when (state.relation) {
                    VersionRelation.OLDER,
                    VersionRelation.MISSING -> {
                        Button(
                            onClick = {
                                if (currentProgress == 100) {
                                    vm.installerIntent()
                                        ?.let(installerLauncher::launch)
                                } else {
                                    vm.download()
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !state.busy
                        ) {
                            Text(
                                if (currentProgress == 100) {
                                    "Instalar APK validado"
                                } else {
                                    "Descargar e instalar"
                                }
                            )
                        }
                    }

                    VersionRelation.SAME -> {
                        Button(
                            onClick = vm::check,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Volver a comprobar")
                        }
                    }

                    VersionRelation.NEWER -> {
                        Button(
                            onClick = {
                                if (currentProgress == 100) {
                                    uninstallLauncher.launch(
                                        vm.uninstallTargetIntent()
                                    )
                                } else {
                                    confirmDowngrade = true
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !state.busy
                        ) {
                            Text(
                                if (currentProgress == 100) {
                                    "Desinstalar versión superior e instalar 4.34.5"
                                } else {
                                    "Volver a la versión ${PackageRepository.TARGET_VERSION}"
                                }
                            )
                        }
                    }

                    VersionRelation.UNKNOWN -> {
                        Button(
                            onClick = vm::check,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Volver a comprobar")
                        }
                    }
                }

                if (
                    state.relation == VersionRelation.NEWER &&
                    confirmDowngrade
                ) {
                    AlertDialog(
                        onDismissRequest = {
                            confirmDowngrade = false
                        },
                        title = {
                            Text("Advertencia: posible pérdida de datos")
                        },
                        text = {
                            Text(
                                "Para instalar la versión ${PackageRepository.TARGET_VERSION}, " +
                                    "será necesario desinstalar la versión actual. Esto puede " +
                                    "borrar datos locales, sesiones y configuraciones. Primero " +
                                    "se descargará y validará el APK. ¿Deseas continuar?"
                            )
                        },
                        confirmButton = {
                            TextButton(
                                onClick = {
                                    confirmDowngrade = false
                                    vm.download()
                                }
                            ) {
                                Text("Descargar y validar")
                            }
                        },
                        dismissButton = {
                            TextButton(
                                onClick = {
                                    confirmDowngrade = false
                                }
                            ) {
                                Text("Cancelar")
                            }
                        }
                    )
                }

                Text(
                    text = "La instalación y desinstalación requieren confirmación del sistema Android. " +
                        "La compatibilidad de la firma sigue siendo necesaria para actualizar una app existente.",
                    color = Color.Gray,
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
    }
}
