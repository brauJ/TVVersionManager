package com.example.tvversionmanager

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
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
        setContent { TVManagerScreen() }
    }

}

@Composable
private fun TVManagerScreen(vm: MainViewModel = viewModel()) {
    val state by vm.state.collectAsState()
    var confirmDowngrade by remember { mutableStateOf(false) }
    val installPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        vm.refreshAfterInstall()
    }
    val installerLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        vm.refreshAfterInstall()
    }

    LaunchedEffect(Unit) { vm.check() }

    MaterialTheme(colorScheme = darkColorScheme(
        primary = Color(0xFF4DA3FF),
        background = Color(0xFF101318),
        surface = Color(0xFF1A2029)
    )) {
        Surface(Modifier.fillMaxSize(), color = Color(0xFF101318)) {
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Text("TV Version Manager", style = MaterialTheme.typography.headlineMedium, color = Color.White)
                Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF1A2029))) {
                    Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Aplicación objetivo", style = MaterialTheme.typography.titleMedium, color = Color.White)
                        Text("Paquete: ${PackageRepository.TARGET_PACKAGE}", color = Color.LightGray)
                        Text("Nombre detectado: ${state.installed?.label ?: if (state.relation == VersionRelation.MISSING) "No instalada" else "Buscando…"}", color = Color.White)
                        Text("Versión instalada: ${state.installed?.versionName ?: "—"}", color = Color.White)
                        Text("Versión objetivo: ${PackageRepository.TARGET_VERSION}", color = Color.White)
                    }
                }
                val statusColor = when (state.relation) {
                    VersionRelation.SAME -> Color(0xFF55D68B)
                    VersionRelation.OLDER, VersionRelation.MISSING -> Color(0xFF4DA3FF)
                    VersionRelation.NEWER -> Color(0xFFFFB74D)
                    VersionRelation.UNKNOWN -> Color(0xFFFF6B6B)
                }
                Text(state.message, color = statusColor, style = MaterialTheme.typography.bodyLarge)
                if (state.busy) {
                    if (state.progress != null) LinearProgressIndicator(progress = { state.progress / 100f }, modifier = Modifier.fillMaxWidth())
                    else LinearProgressIndicator(Modifier.fillMaxWidth())
                    Text("Descargado: ${state.downloadedBytes / 1024} KB${state.progress?.let { " · $it%" } ?: ""}", color = Color.LightGray)
                    Button(onClick = vm::cancelDownload, modifier = Modifier.fillMaxWidth()) { Text("Cancelar descarga") }
                }
                state.error?.let { Text(it, color = Color(0xFFFF6B6B)) }
                if (state.installPermissionNeeded) {
                    Text("Permite instalar aplicaciones desde TV Version Manager en Ajustes y vuelve aquí.", color = Color(0xFFFFB74D))
                    Button(onClick = { installPermissionLauncher.launch(vm.installPermissionIntent()) }, modifier = Modifier.fillMaxWidth()) { Text("Abrir ajustes de instalación") }
                }
                when (state.relation) {
                    VersionRelation.OLDER, VersionRelation.MISSING -> Button(
                        onClick = { if (state.progress == 100) vm.installerIntent()?.let(installerLauncher::launch) else vm.download() },
                        modifier = Modifier.fillMaxWidth(), enabled = !state.busy
                    ) { Text(if (state.progress == 100) "Instalar APK validado" else "Descargar e instalar") }
                    VersionRelation.SAME -> Button(onClick = vm::check, modifier = Modifier.fillMaxWidth()) { Text("Volver a comprobar") }
                    VersionRelation.NEWER -> Button(
                        onClick = {
                            if (state.progress == 100) {
                                vm.installerIntent()?.let(installerLauncher::launch)
                            } else confirmDowngrade = true
                        },
                        modifier = Modifier.fillMaxWidth(), enabled = !state.busy
                    ) { Text(if (state.progress == 100) "Abrir instalador (puede rechazar la degradación)" else "Volver a la versión 4.34.5") }
                    VersionRelation.UNKNOWN -> Button(onClick = vm::check, modifier = Modifier.fillMaxWidth()) { Text("Volver a comprobar") }
                }
                if (state.relation == VersionRelation.NEWER && confirmDowngrade) {
                    AlertDialog(
                        onDismissRequest = { confirmDowngrade = false },
                        title = { Text("Advertencia: posible pérdida de datos") },
                        text = { Text("Android normalmente no permite degradar una aplicación instalada. Para continuar puede ser necesario desinstalarla, lo que puede borrar datos locales, sesiones y configuraciones. Descarga y valida primero el APK; no se desinstalará nada automáticamente. ¿Deseas continuar?") },
                        confirmButton = {
                            TextButton(onClick = {
                                confirmDowngrade = false
                                vm.download()
                            }) { Text("Descargar y validar") }
                        },
                        dismissButton = { TextButton(onClick = { confirmDowngrade = false }) { Text("Cancelar") } }
                    )
                }
                Text("La instalación siempre requiere confirmación del sistema. Para una instalación nueva, configura EXPECTED_SHA256 con una huella fiable antes de distribuir la app.", color = Color.Gray, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
