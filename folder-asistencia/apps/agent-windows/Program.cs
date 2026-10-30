
using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using libzkfpcsharp;

internal class Program
{
    private const int TemplateCapacity = 2048;
    private const int CaptureTimeoutSeconds = 30;
    private const int ParamImageWidth = 1;
    private const int ParamImageHeight = 2;

    private const string LocalAddress = "http://127.0.0.1:17865/";
    private const string AllowedOrigin = "https://asistencia.brauj.com";

    private static readonly string DataDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "AsistenciaAgent");

    private static readonly string DataPath =
        Path.Combine(DataDirectory, "templates.dat");

    private static readonly byte[] Entropy =
        Encoding.UTF8.GetBytes("AsistenciaAgent.ZKTeco.TemplateStore.v1");

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = false,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    private static readonly HttpClient ApiClient = new()
    {
        Timeout = TimeSpan.FromSeconds(20)
    };

    // Estado seguro que puede consultar la página web.
    private static readonly object StatusLock = new();

    private static string AgentStatus = "starting";
    private static bool ReaderConnected;
    private static int RegisteredTemplates;
    private static int PendingCount;

    private static LastEventInfo? LastEvent;

    private sealed class LastEventInfo
    {
        public string EmployeeName { get; set; } = "";
        public string OccurredAt { get; set; } = "";
        public string Result { get; set; } = "";
        public string? Message { get; set; }
    }

    private static int Main(string[] args)
    {
        IntPtr device = IntPtr.Zero;
        IntPtr database = IntPtr.Zero;
        bool initialized = false;

        try
        {
            bool serviceMode = args.Any(a =>
                a.Equals("--service", StringComparison.OrdinalIgnoreCase));

            Console.WriteLine("=== AsistenciaAgent ===");

            int result = zkfp2.Init();

            if (result != zkfp.ZKFP_ERR_OK)
            {
                Console.WriteLine($"Error Init(): {result}");
                return 1;
            }

            initialized = true;

            int count = zkfp2.GetDeviceCount();

            Console.WriteLine($"Lectores detectados: {count}");

            if (count < 1)
            {
                Console.WriteLine("Conecta el lector y vuelve a ejecutar.");
                return 2;
            }

            device = zkfp2.OpenDevice(0);

            if (device == IntPtr.Zero)
            {
                Console.WriteLine("No se pudo abrir el lector.");
                return 3;
            }

            database = zkfp2.DBInit();

            if (database == IntPtr.Zero)
            {
                Console.WriteLine("No se pudo crear la base biométrica.");
                return 4;
            }

            int width = GetParameter(device, ParamImageWidth);
            int height = GetParameter(device, ParamImageHeight);

            if (width <= 0 || height <= 0)
            {
                throw new InvalidOperationException(
                    "Dimensiones del sensor inválidas.");
            }

            byte[] image = new byte[checked(width * height)];

            Directory.CreateDirectory(DataDirectory);

            Store store = LoadStore();

            // Cargar las plantillas existentes en la base del SDK.
            foreach (TemplateRecord record in store.Records)
            {
                if (record.Fid <= 0 ||
                    record.Template == null ||
                    record.Template.Length != TemplateCapacity)
                {
                    Console.WriteLine(
                        "Registro biométrico inválido. No se continuará.");

                    return 6;
                }

                result = zkfp2.DBAdd(
                    database,
                    record.Fid,
                    record.Template);

                if (result != zkfp.ZKFP_ERR_OK)
                {
                    Console.WriteLine(
                        $"No se pudo cargar la plantilla local {record.Fid}. " +
                        $"Código SDK: {result}.");

                    return 7;
                }
            }

            lock (StatusLock)
            {
                AgentStatus = "ready";
                ReaderConnected = true;
                RegisteredTemplates = store.Records.Count;
                PendingCount = store.PendingEvents.Count;
            }

            Console.WriteLine(
                $"Registros biométricos cargados: {store.Records.Count}");

            Console.WriteLine(
                $"Eventos pendientes: {store.PendingEvents.Count}");

            Console.WriteLine("Plantillas protegidas localmente con DPAPI.");
            Console.WriteLine("Las plantillas no se envían a la API.");

            if (serviceMode)
            {
                RunContinuousAgent(device, database, image, store);
                return 0;
            }

            // MODO NORMAL: menú de administración.
            while (true)
            {
                Console.WriteLine();
                Console.WriteLine("1. Registrar trabajador");
                Console.WriteLine("2. Identificar huella y marcar asistencia");
                Console.WriteLine("3. Listar trabajadores registrados");
                Console.WriteLine("4. Reintentar marcaciones pendientes");
                Console.WriteLine("0. Salir");
                Console.Write("Opción: ");

                string? option = Console.ReadLine()?.Trim();

                if (option == "0")
                    break;

                switch (option)
                {
                    case "1":
                        Enroll(device, database, image, store);
                        UpdateStatus(store);
                        break;

                    case "2":
                        Identify(device, database, image, store);
                        UpdateStatus(store);
                        break;

                    case "3":
                        ListRecords(store);
                        break;

                    case "4":
                        RetryPendingEvents(store);
                        UpdateStatus(store);
                        break;

                    default:
                        Console.WriteLine("Opción no válida.");
                        break;
                }
            }

            return 0;
        }
        catch (Exception ex)
        {
            lock (StatusLock)
            {
                AgentStatus = "error";
                ReaderConnected = false;
            }

            Console.WriteLine(
                $"Error: {ex.GetType().Name}: {ex.Message}");

            return 20;
        }
        finally
        {
            if (database != IntPtr.Zero)
            {
                try
                {
                    Console.WriteLine(
                        $"DBFree(): {zkfp2.DBFree(database)}");
                }
                catch (Exception ex)
                {
                    Console.WriteLine(ex.Message);
                }
            }

            if (device != IntPtr.Zero)
            {
                try
                {
                    Console.WriteLine(
                        $"CloseDevice(): {zkfp2.CloseDevice(device)}");
                }
                catch (Exception ex)
                {
                    Console.WriteLine(ex.Message);
                }
            }

            if (initialized)
            {
                try
                {
                    Console.WriteLine(
                        $"Terminate(): {zkfp2.Terminate()}");
                }
                catch (Exception ex)
                {
                    Console.WriteLine(ex.Message);
                }
            }
        }
    }

    // =========================================================
    // MODO CONTINUO
    // =========================================================

    private static void RunContinuousAgent(
        IntPtr device,
        IntPtr database,
        byte[] image,
        Store store)
    {
        Console.WriteLine();
        Console.WriteLine("======================================");
        Console.WriteLine(" ASISTENCIA AGENT - MODO CONTINUO");
        Console.WriteLine("======================================");
        Console.WriteLine($"Servidor local: {LocalAddress}");
        Console.WriteLine($"Trabajadores: {store.Records.Count}");
        Console.WriteLine($"Pendientes: {store.PendingEvents.Count}");
        Console.WriteLine("Esperando huellas...");
        Console.WriteLine("Presiona CTRL+C para detener.");

        using HttpListener listener = new();

        listener.Prefixes.Add(LocalAddress);
        listener.Start();

        Console.WriteLine("Servidor local iniciado.");

        _ = Task.Run(() => RunLocalHttpServer(listener));

        DateTime lastRetry = DateTime.MinValue;

        while (true)
        {
            try
            {
                UpdateStatus(store);

                // Reintentar eventos pendientes cada 15 segundos.
                if (store.PendingEvents.Count > 0 &&
                    (DateTime.UtcNow - lastRetry).TotalSeconds >= 15)
                {
                    Console.WriteLine();
                    Console.WriteLine("Reintentando eventos pendientes...");

                    RetryPendingEvents(store);

                    lastRetry = DateTime.UtcNow;

                    UpdateStatus(store);
                }

                if (store.Records.Count == 0)
                {
                    Thread.Sleep(300);
                    continue;
                }

                byte[] sample = new byte[TemplateCapacity];

                // Una sola consulta de captura por ciclo.
                // Esto permite reintentar eventos incluso cuando no hay dedos.
                int length = TryCaptureTemplate(
                    device,
                    image,
                    sample);

                if (length <= 0)
                {
                    Thread.Sleep(150);
                    continue;
                }

                int fid = 0;
                int score = 0;

                int result = zkfp2.DBIdentify(
                    database,
                    sample,
                    ref fid,
                    ref score);

                if (result != zkfp.ZKFP_ERR_OK)
                {
                    Console.WriteLine("Huella no identificada.");

                    WaitForFingerRemoval(device, image);
                    continue;
                }

                TemplateRecord? record =
                    store.Records.FirstOrDefault(r => r.Fid == fid);

                if (record == null)
                {
                    Console.WriteLine(
                        "El SDK devolvió un ID que no existe localmente.");

                    WaitForFingerRemoval(device, image);
                    continue;
                }

                Console.WriteLine();
                Console.WriteLine("¡HUELLA IDENTIFICADA!");
                Console.WriteLine($"Trabajador: {record.Name}");
                Console.WriteLine($"ID local: {record.EmployeeId}");
                Console.WriteLine($"Puntuación SDK: {score}");

                var pending = new PendingEvent
                {
                    EventId = Guid.NewGuid().ToString("D"),
                    DeviceTemplateId = GetDeviceTemplateId(record.Fid),
                    OccurredAt = DateTime.UtcNow
                };

                // Guardar primero el evento cifrado.
                store.PendingEvents.Add(pending);

                try
                {
                    SaveStore(store);
                }
                catch (Exception ex)
                {
                    store.PendingEvents.Remove(pending);

                    Console.WriteLine(
                        $"No se pudo guardar el evento: {ex.Message}");

                    WaitForFingerRemoval(device, image);
                    continue;
                }

                lock (StatusLock)
                {
                    LastEvent = new LastEventInfo
                    {
                        EmployeeName = record.Name,
                        OccurredAt = pending.OccurredAt.ToString("O"),
                        Result = "QUEUED",
                        Message = "Marcación guardada. Esperando confirmación."
                    };
                }

                UpdateStatus(store);

                // Enviar a la API.
                SendPendingEvent(store, pending);

                UpdateStatus(store);

                // Evitar registrar varias veces mientras se mantiene el dedo.
                WaitForFingerRemoval(device, image);
            }
            catch (Exception ex)
            {
                Console.WriteLine(
                    $"Error en el ciclo de marcación: {ex.GetType().Name}: {ex.Message}");

                Thread.Sleep(1000);
            }
        }
    }

    private static int TryCaptureTemplate(
        IntPtr device,
        byte[] image,
        byte[] template)
    {
        int length = template.Length;

        int result = zkfp2.AcquireFingerprint(
            device,
            image,
            template,
            ref length);

        if (result == zkfp.ZKFP_ERR_OK && length > 0)
            return length;

        return 0;
    }

    private static void WaitForFingerRemoval(
        IntPtr device,
        byte[] image)
    {
        Console.WriteLine("Retira el dedo del lector...");

        int consecutiveEmpty = 0;

        while (consecutiveEmpty < 8)
        {
            byte[] temporaryTemplate = new byte[TemplateCapacity];

            int length = temporaryTemplate.Length;

            int result = zkfp2.AcquireFingerprint(
                device,
                image,
                temporaryTemplate,
                ref length);

            if (result != zkfp.ZKFP_ERR_OK || length <= 0)
            {
                consecutiveEmpty++;
            }
            else
            {
                consecutiveEmpty = 0;
            }

            Thread.Sleep(200);
        }

        Console.WriteLine(
            "Lector listo para la siguiente marcación.");
    }

    // =========================================================
    // SERVIDOR LOCAL PARA LA PÁGINA WEB
    // =========================================================

    private static async Task RunLocalHttpServer(
        HttpListener listener)
    {
        while (listener.IsListening)
        {
            HttpListenerContext context;

            try
            {
                context = await listener.GetContextAsync();
            }
            catch (HttpListenerException)
            {
                break;
            }
            catch (ObjectDisposedException)
            {
                break;
            }

            _ = Task.Run(() => HandleLocalRequest(context));
        }
    }

    private static void HandleLocalRequest(
        HttpListenerContext context)
    {
        try
        {
            HttpListenerRequest request = context.Request;
            HttpListenerResponse response = context.Response;

            string origin = request.Headers["Origin"] ?? "";

            // No aceptar solicitudes de otros sitios web.
            if (!string.IsNullOrEmpty(origin) && origin != AllowedOrigin)
{
    context.Response.StatusCode = 403;
    context.Response.Close();
    return;
}

            response.Headers["Access-Control-Allow-Origin"] =
                AllowedOrigin;

            response.Headers["Vary"] = "Origin";

            response.Headers["Access-Control-Allow-Methods"] =
                "GET, OPTIONS";

            response.Headers["Access-Control-Allow-Headers"] =
                "Content-Type";

            response.Headers["Cache-Control"] = "no-store";

            // Compatibilidad con preflight de acceso a red local.
            if (request.Headers[
                "Access-Control-Request-Private-Network"] == "true")
            {
                response.Headers[
                    "Access-Control-Allow-Private-Network"] = "true";
            }

            if (request.HttpMethod == "OPTIONS")
            {
                response.StatusCode = 204;
                response.Close();
                return;
            }

            if (request.HttpMethod != "GET" ||
                request.Url?.AbsolutePath != "/status")
            {
                response.StatusCode = 404;
                response.Close();
                return;
            }

            object status;

            lock (StatusLock)
            {
                status = new
                {
                    status = AgentStatus,
                    readerConnected = ReaderConnected,
                    registeredTemplates = RegisteredTemplates,
                    pendingEvents = PendingCount,
                    lastEvent = LastEvent
                };
            }

            string json = JsonSerializer.Serialize(
                status,
                JsonOptions);

            byte[] bytes = Encoding.UTF8.GetBytes(json);

            response.StatusCode = 200;
            response.ContentType =
                "application/json; charset=utf-8";

            response.ContentLength64 = bytes.Length;

            response.OutputStream.Write(
                bytes,
                0,
                bytes.Length);

            response.Close();
        }
        catch
        {
            try
            {
                context.Response.Close();
            }
            catch
            {
                // El navegador pudo cerrar la conexión.
            }
        }
    }

    private static void UpdateStatus(Store store)
    {
        lock (StatusLock)
        {
            PendingCount = store.PendingEvents.Count;
            RegisteredTemplates = store.Records.Count;
            ReaderConnected = true;
            AgentStatus = "ready";
        }
    }

    // =========================================================
    // REGISTRO DE TRABAJADORES
    // =========================================================

    private static void Enroll(
        IntPtr device,
        IntPtr database,
        byte[] image,
        Store store)
    {
        Console.Write("ID local del trabajador (único): ");

        string? employeeId = Console.ReadLine()?.Trim();

        if (string.IsNullOrWhiteSpace(employeeId))
        {
            Console.WriteLine("El ID es obligatorio.");
            return;
        }

        if (store.Records.Any(r =>
            string.Equals(
                r.EmployeeId,
                employeeId,
                StringComparison.OrdinalIgnoreCase)))
        {
            Console.WriteLine(
                "Ese trabajador ya tiene una huella registrada.");

            return;
        }

        Console.Write("Nombre del trabajador: ");

        string? name = Console.ReadLine()?.Trim();

        if (string.IsNullOrWhiteSpace(name))
        {
            Console.WriteLine("El nombre es obligatorio.");
            return;
        }

        Console.WriteLine(
            "Verifica que cuentas con autorización para registrar la huella.");

        byte[][] samples =
        {
            new byte[TemplateCapacity],
            new byte[TemplateCapacity],
            new byte[TemplateCapacity]
        };

        for (int i = 0; i < 3; i++)
        {
            Console.WriteLine();
            Console.WriteLine($"CAPTURA {i + 1} DE 3");

            if (i > 0)
            {
                Console.WriteLine(
                    "Levanta el dedo y vuelve a colocarlo.");

                Console.WriteLine(
                    "Presiona ENTER cuando estés preparado.");

                Console.ReadLine();
            }

            int length = CaptureTemplate(
                device,
                image,
                samples[i]);

            if (length <= 0)
            {
                Console.WriteLine(
                    "Captura fallida. No se guardó el registro.");

                return;
            }

            Console.WriteLine(
                $"Captura recibida: {length} bytes.");
        }

        byte[] registrationTemplate =
            new byte[TemplateCapacity];

        int registrationLength = 0;

        int result = zkfp2.DBMerge(
            database,
            samples[0],
            samples[1],
            samples[2],
            registrationTemplate,
            ref registrationLength);

        if (result != zkfp.ZKFP_ERR_OK ||
            registrationLength <= 0 ||
            registrationLength > TemplateCapacity)
        {
            Console.WriteLine(
                $"DBMerge falló: código {result}; " +
                $"longitud {registrationLength}.");

            return;
        }

        int fid = store.Records.Count == 0
            ? 1
            : checked(store.Records.Max(r => r.Fid) + 1);

        result = zkfp2.DBAdd(
            database,
            fid,
            registrationTemplate);

        if (result != zkfp.ZKFP_ERR_OK)
        {
            Console.WriteLine($"DBAdd falló: {result}");
            return;
        }

        var record = new TemplateRecord
        {
            Fid = fid,
            EmployeeId = employeeId,
            Name = name,
            TemplateLength = registrationLength,
            Template = registrationTemplate,
            CreatedAtUtc = DateTime.UtcNow
        };

        store.Records.Add(record);

        try
        {
            SaveStore(store);

            Console.WriteLine(
                "Registro guardado y cifrado localmente.");

            Console.WriteLine(
                $"ID interno de plantilla: {fid}");

            Console.WriteLine(
                $"Trabajador: {name} ({employeeId})");

            Console.WriteLine(
                "La plantilla permanece en este equipo.");

            Console.WriteLine(
                "Registra también la correspondencia de esta plantilla " +
                "en el servidor antes de utilizarla para marcar.");
        }
        catch (Exception ex)
        {
            store.Records.Remove(record);

            try
            {
                zkfp2.DBDel(database, fid);
            }
            catch
            {
                Console.WriteLine(
                    "Advertencia: verifica la base biométrica en memoria.");
            }

            Console.WriteLine(
                $"No se pudo guardar el archivo protegido: {ex.Message}");
        }
    }

    // =========================================================
    // IDENTIFICACIÓN MANUAL DEL MENÚ
    // =========================================================

    private static void Identify(
        IntPtr device,
        IntPtr database,
        byte[] image,
        Store store)
    {
        if (store.Records.Count == 0)
        {
            Console.WriteLine(
                "No hay trabajadores registrados.");

            return;
        }

        Console.WriteLine(
            "Coloca el dedo en el lector...");

        byte[] sample = new byte[TemplateCapacity];

        int length = CaptureTemplate(
            device,
            image,
            sample);

        if (length <= 0)
        {
            Console.WriteLine(
                "No se pudo capturar la huella.");

            return;
        }

        int fid = 0;
        int score = 0;

        int result = zkfp2.DBIdentify(
            database,
            sample,
            ref fid,
            ref score);

        if (result != zkfp.ZKFP_ERR_OK)
        {
            Console.WriteLine("Huella no identificada.");
            Console.WriteLine($"Código SDK: {result}");
            return;
        }

        TemplateRecord? record =
            store.Records.FirstOrDefault(r => r.Fid == fid);

        if (record == null)
        {
            Console.WriteLine(
                "El SDK devolvió un ID que no existe en el registro local.");

            return;
        }

        Console.WriteLine();
        Console.WriteLine("¡Huella identificada!");
        Console.WriteLine($"Trabajador: {record.Name}");
        Console.WriteLine($"ID local del trabajador: {record.EmployeeId}");
        Console.WriteLine($"ID interno de plantilla: {record.Fid}");
        Console.WriteLine($"Puntuación SDK: {score}");

        CreateAndSendEvent(store, record);
    }

    private static void CreateAndSendEvent(
        Store store,
        TemplateRecord record)
    {
        var pending = new PendingEvent
        {
            EventId = Guid.NewGuid().ToString("D"),
            DeviceTemplateId = GetDeviceTemplateId(record.Fid),
            OccurredAt = DateTime.UtcNow
        };

        store.PendingEvents.Add(pending);

        try
        {
            SaveStore(store);
        }
        catch (Exception ex)
        {
            store.PendingEvents.Remove(pending);

            Console.WriteLine(
                $"No se pudo guardar la marcación local; no se envió: {ex.Message}");

            return;
        }

        lock (StatusLock)
        {
            LastEvent = new LastEventInfo
            {
                EmployeeName = record.Name,
                OccurredAt = pending.OccurredAt.ToString("O"),
                Result = "QUEUED",
                Message = "Marcación guardada; esperando confirmación."
            };
        }

        SendPendingEvent(store, pending);
        UpdateStatus(store);
    }

    private static string GetDeviceTemplateId(int fid)
    {
        string? deviceId =
            Environment.GetEnvironmentVariable(
                "ATTENDANCE_DEVICE_ID");

        if (string.IsNullOrWhiteSpace(deviceId))
        {
            throw new InvalidOperationException(
                "Falta la variable ATTENDANCE_DEVICE_ID.");
        }

        return $"zkfp:{deviceId.Trim()}:fid:{fid}";
    }

    // =========================================================
    // REINTENTO DE EVENTOS
    // =========================================================

    private static void RetryPendingEvents(Store store)
    {
        if (store.PendingEvents.Count == 0)
        {
            Console.WriteLine(
                "No hay marcaciones pendientes de envío.");

            return;
        }

        Console.WriteLine(
            $"Se intentarán enviar {store.PendingEvents.Count} evento(s) pendiente(s).");

        foreach (PendingEvent pending in store.PendingEvents.ToList())
        {
            SendPendingEvent(store, pending);
        }

        Console.WriteLine(
            $"Eventos que continúan pendientes: {store.PendingEvents.Count}");

        UpdateStatus(store);
    }

    // =========================================================
    // ENVÍO A LA API
    // =========================================================

    private static void SendPendingEvent(
        Store store,
        PendingEvent pending)
    {
        string? baseUrl =
            Environment.GetEnvironmentVariable(
                "ATTENDANCE_API_URL");

        string? deviceId =
            Environment.GetEnvironmentVariable(
                "ATTENDANCE_DEVICE_ID");

        string? secret =
            Environment.GetEnvironmentVariable(
                "ATTENDANCE_DEVICE_SECRET");

        if (string.IsNullOrWhiteSpace(baseUrl) ||
            string.IsNullOrWhiteSpace(deviceId) ||
            string.IsNullOrWhiteSpace(secret))
        {
            Console.WriteLine(
                "No se envió: configura ATTENDANCE_API_URL, " +
                "ATTENDANCE_DEVICE_ID y ATTENDANCE_DEVICE_SECRET.");

            Console.WriteLine(
                "El evento permanece guardado para reintentar.");

            return;
        }

        if (!Uri.TryCreate(
                baseUrl.Trim(),
                UriKind.Absolute,
                out Uri? baseUri) ||
            baseUri.Scheme != Uri.UriSchemeHttps)
        {
            Console.WriteLine(
                "La URL de la API debe ser HTTPS. " +
                "El evento sigue pendiente.");

            return;
        }

        string endpoint =
            baseUri.AbsoluteUri.TrimEnd('/') + "/device/punch";

        var payload = new PunchRequest
        {
            EventId = pending.EventId,
            DeviceTemplateId = pending.DeviceTemplateId,
            OccurredAt = pending.OccurredAt
        };

        try
        {
            string json = JsonSerializer.Serialize(
                payload,
                JsonOptions);

            using var request = new HttpRequestMessage(
                HttpMethod.Post,
                endpoint);

            request.Headers.Add(
                "x-device-id",
                deviceId.Trim());

            request.Headers.Add(
                "x-device-secret",
                secret);

            request.Content = new StringContent(
                json,
                Encoding.UTF8,
                "application/json");

            using HttpResponseMessage response =
                ApiClient.SendAsync(request)
                    .GetAwaiter()
                    .GetResult();

            string responseBody =
                response.Content.ReadAsStringAsync()
                    .GetAwaiter()
                    .GetResult();

            Console.WriteLine();
            Console.WriteLine(
                $"HTTP {(int)response.StatusCode} ({response.StatusCode})");

            if (!string.IsNullOrWhiteSpace(responseBody))
            {
                Console.WriteLine(
                    $"Respuesta API: {responseBody}");
            }

            if (!response.IsSuccessStatusCode)
            {
                Console.WriteLine(
                    "El servidor no confirmó la recepción. " +
                    "Se conserva el evento para reintentar.");

                SetLastEventResult(
                    pending.EventId,
                    "QUEUED",
                    "El servidor no confirmó la recepción.");

                return;
            }

            string result;
            bool duplicate;

            try
            {
                using JsonDocument document =
                    JsonDocument.Parse(responseBody);

                JsonElement root = document.RootElement;

                result =
                    root.TryGetProperty(
                        "result",
                        out JsonElement resultElement) &&
                    resultElement.ValueKind == JsonValueKind.String
                        ? resultElement.GetString() ?? ""
                        : "";

                duplicate =
                    root.TryGetProperty(
                        "duplicate",
                        out JsonElement duplicateElement) &&
                    duplicateElement.ValueKind == JsonValueKind.True;
            }
            catch (JsonException)
            {
                Console.WriteLine(
                    "La API respondió con HTTP exitoso, pero el JSON " +
                    "no es válido. El evento se conserva.");

                SetLastEventResult(
                    pending.EventId,
                    "QUEUED",
                    "Respuesta de la API no válida.");

                return;
            }

            bool accepted = result == "ACCEPTED";
            bool pendingReview = result == "PENDING_REVIEW";

            if (result == "DUPLICATE")
            {
                Console.WriteLine(
                    "La API indica DUPLICATE sin informar el resultado original. " +
                    "El evento permanece en la cola.");

                SetLastEventResult(
                    pending.EventId,
                    "QUEUED",
                    "Duplicado sin resultado original verificable.");

                return;
            }

            if (!accepted && !pendingReview)
            {
                Console.WriteLine(
                    $"Resultado API no reconocido: '{result}'. " +
                    "El evento permanece en la cola local.");

                SetLastEventResult(
                    pending.EventId,
                    "QUEUED",
                    $"Resultado API no reconocido: {result}");

                return;
            }

            // La API confirmó ACCEPTED o PENDING_REVIEW.
            store.PendingEvents.Remove(pending);

            try
            {
                SaveStore(store);

                if (pendingReview)
                {
                    Console.WriteLine(
                        "Evento recibido por la API, pero pendiente de revisión.");

                    SetLastEventResult(
                        pending.EventId,
                        "PENDING_REVIEW",
                        "Recibida por el servidor; requiere revisión.");
                }
                else if (duplicate)
                {
                    Console.WriteLine(
                        "Evento ya procesado anteriormente como ACCEPTED.");

                    SetLastEventResult(
                        pending.EventId,
                        "ACCEPTED",
                        "Evento procesado anteriormente; no se duplicó.");
                }
                else
                {
                    Console.WriteLine(
                        "Marcación ACCEPTED por la API.");

                    SetLastEventResult(
                        pending.EventId,
                        "ACCEPTED",
                        "Marcación aceptada por el servidor.");
                }
            }
            catch (Exception ex)
            {
                if (!store.PendingEvents.Any(
                    p => p.EventId == pending.EventId))
                {
                    store.PendingEvents.Add(pending);
                }

                Console.WriteLine(
                    "La API respondió, pero no se pudo guardar " +
                    $"la actualización de la cola local: {ex.Message}");

                Console.WriteLine(
                    "Se conserva el mismo eventId para mantener la idempotencia.");

                SetLastEventResult(
                    pending.EventId,
                    "QUEUED",
                    "No se pudo actualizar la cola local.");
            }
        }
        catch (TaskCanceledException)
        {
            Console.WriteLine(
                "Tiempo de espera agotado. No se sabe si el servidor procesó el evento.");

            Console.WriteLine(
                "Se conserva el mismo eventId.");

            SetLastEventResult(
                pending.EventId,
                "QUEUED",
                "Tiempo de espera agotado; se reintentará.");
        }
        catch (HttpRequestException ex)
        {
            Console.WriteLine(
                $"Error de conexión HTTPS: {ex.Message}");

            Console.WriteLine(
                "El evento permanece pendiente.");

            SetLastEventResult(
                pending.EventId,
                "QUEUED",
                "Sin conexión con el servidor; se reintentará.");
        }
        catch (Exception ex)
        {
            Console.WriteLine(
                $"No se pudo completar el envío: {ex.GetType().Name}: {ex.Message}");

            Console.WriteLine(
                "El evento permanece pendiente.");

            SetLastEventResult(
                pending.EventId,
                "QUEUED",
                "Error de envío; se reintentará.");
        }
        finally
        {
            UpdateStatus(store);
        }
    }

    private static void SetLastEventResult(
        string eventId,
        string result,
        string message)
    {
        lock (StatusLock)
        {
            if (LastEvent != null)
            {
                LastEvent.Result = result;
                LastEvent.Message = message;
            }
        }
    }

    // =========================================================
    // LISTAR TRABAJADORES
    // =========================================================

    private static void ListRecords(Store store)
    {
        Console.WriteLine();

        Console.WriteLine(
            $"Trabajadores registrados: {store.Records.Count}");

        foreach (TemplateRecord record in
            store.Records.OrderBy(r => r.Fid))
        {
            Console.WriteLine(
                $"ID local {record.Fid} | {record.EmployeeId} | " +
                $"{record.Name} | Plantilla: {record.TemplateLength} bytes");
        }
    }

    // =========================================================
    // ALMACENAMIENTO CIFRADO DPAPI
    // =========================================================

    private static Store LoadStore()
    {
        if (!File.Exists(DataPath))
            return new Store();

        byte[] encrypted = File.ReadAllBytes(DataPath);

        byte[] clear = ProtectedData.Unprotect(
            encrypted,
            Entropy,
            DataProtectionScope.CurrentUser);

        try
        {
            Store? store =
                JsonSerializer.Deserialize<Store>(
                    clear,
                    JsonOptions);

            if (store == null || store.Records == null)
            {
                throw new InvalidDataException(
                    "El archivo no contiene registros válidos.");
            }

            store.PendingEvents ??= new List<PendingEvent>();

            var ids = new HashSet<int>();

            var employeeIds = new HashSet<string>(
                StringComparer.OrdinalIgnoreCase);

            foreach (TemplateRecord record in store.Records)
            {
                if (record.Fid <= 0 ||
                    string.IsNullOrWhiteSpace(record.EmployeeId) ||
                    string.IsNullOrWhiteSpace(record.Name) ||
                    record.Template == null ||
                    record.Template.Length != TemplateCapacity ||
                    record.TemplateLength <= 0 ||
                    record.TemplateLength > TemplateCapacity ||
                    !ids.Add(record.Fid) ||
                    !employeeIds.Add(record.EmployeeId))
                {
                    throw new InvalidDataException(
                        "Se encontró un registro biométrico inválido o duplicado.");
                }
            }

            var eventIds = new HashSet<string>(
                StringComparer.Ordinal);

            foreach (PendingEvent pending in store.PendingEvents)
            {
                if (string.IsNullOrWhiteSpace(pending.EventId) ||
                    pending.EventId.Length < 8 ||
                    pending.EventId.Length > 190 ||
                    string.IsNullOrWhiteSpace(pending.DeviceTemplateId) ||
                    pending.DeviceTemplateId.Length > 190 ||
                    pending.OccurredAt == default ||
                    !eventIds.Add(pending.EventId))
                {
                    throw new InvalidDataException(
                        "Se encontró un evento pendiente inválido o duplicado.");
                }
            }

            return store;
        }
        finally
        {
            CryptographicOperations.ZeroMemory(clear);
        }
    }

    private static void SaveStore(Store store)
    {
        byte[] clear =
            JsonSerializer.SerializeToUtf8Bytes(
                store,
                JsonOptions);

        byte[] encrypted = ProtectedData.Protect(
            clear,
            Entropy,
            DataProtectionScope.CurrentUser);

        string tempPath = DataPath + ".tmp";

        try
        {
            File.WriteAllBytes(tempPath, encrypted);

            File.Move(
                tempPath,
                DataPath,
                true);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(clear);

            if (File.Exists(tempPath))
                File.Delete(tempPath);
        }
    }

    // =========================================================
    // SDK ZKTECO
    // =========================================================

    private static int GetParameter(
        IntPtr device,
        int parameter)
    {
        byte[] buffer = new byte[4];

        int size = buffer.Length;

        int result = zkfp2.GetParameters(
            device,
            parameter,
            buffer,
            ref size);

        if (result != zkfp.ZKFP_ERR_OK)
        {
            throw new InvalidOperationException(
                $"GetParameters({parameter}) falló: {result}");
        }

        int value = 0;

        zkfp2.ByteArray2Int(
            buffer,
            ref value);

        return value;
    }

    private static int CaptureTemplate(
        IntPtr device,
        byte[] image,
        byte[] template)
    {
        int attempts = CaptureTimeoutSeconds * 5;

        for (int i = 0; i < attempts; i++)
        {
            int length = template.Length;

            int result = zkfp2.AcquireFingerprint(
                device,
                image,
                template,
                ref length);

            if (result == zkfp.ZKFP_ERR_OK && length > 0)
                return length;

            Thread.Sleep(200);
        }

        return 0;
    }

    // =========================================================
    // MODELOS
    // =========================================================

    private sealed class Store
    {
        public List<TemplateRecord> Records { get; set; } = new();

        public List<PendingEvent> PendingEvents { get; set; } = new();
    }

    private sealed class TemplateRecord
    {
        public int Fid { get; set; }

        public string EmployeeId { get; set; } = "";

        public string Name { get; set; } = "";

        public int TemplateLength { get; set; }

        public byte[] Template { get; set; } = Array.Empty<byte>();

        public DateTime CreatedAtUtc { get; set; }
    }

    private sealed class PendingEvent
    {
        public string EventId { get; set; } = "";

        public string DeviceTemplateId { get; set; } = "";

        public DateTime OccurredAt { get; set; }
    }

    private sealed class PunchRequest
    {
        public string EventId { get; set; } = "";

        public string DeviceTemplateId { get; set; } = "";

        public DateTime OccurredAt { get; set; }
    }
}
