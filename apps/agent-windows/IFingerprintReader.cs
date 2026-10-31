namespace AttendanceAgent;

/// <summary>
/// Contrato para el adaptador real del lector. No es una implementación del SDK.
/// Implementar usando documentación, DLL y licencia de la versión oficial instalada.
/// </summary>
public interface IFingerprintReader : IAsyncDisposable
{
    Task InitializeAsync(CancellationToken cancellationToken);
    Task<FingerprintMatch?> IdentifyAsync(CancellationToken cancellationToken);
    Task EnrollAsync(string employeeId, CancellationToken cancellationToken);
    Task RevokeAsync(string credentialId, CancellationToken cancellationToken);
    bool IsConnected { get; }
}

public sealed record FingerprintMatch(string DeviceTemplateId, float? MatchScore);
