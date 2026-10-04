# Generates certificates only. Trust installation is a separate, manual step on each device.
param([string]$OutputDirectory = (Join-Path $PSScriptRoot '../.lan-certs'))
$ErrorActionPreference = 'Stop'
$certDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath (Join-Path $certDirectory 'server-key.pem')) {
  throw 'LAN certificates already exist. Keep them, or move that directory before generating replacements.'
}
New-Item -ItemType Directory -Force -Path $certDirectory | Out-Null
$hash = [System.Security.Cryptography.HashAlgorithmName]::SHA256
$padding = [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
$caKey = [System.Security.Cryptography.RSA]::Create(3072)
$caRequest = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=RetroOasis LAN Authority', $caKey, $hash, $padding)
$caRequest.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($true, $false, 0, $true))
$caRequest.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new([System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyCertSign, $true))
$caRequest.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509SubjectKeyIdentifierExtension]::new($caRequest.PublicKey, $false))
$start = [DateTimeOffset]::UtcNow.AddDays(-1)
$end = [DateTimeOffset]::UtcNow.AddYears(2)
$ca = $caRequest.CreateSelfSigned($start, $end)
$serverKey = [System.Security.Cryptography.RSA]::Create(2048)
$serverRequest = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=RetroOasis LAN', $serverKey, $hash, $padding)
$serverRequest.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false, $false, 0, $true))
$serverRequest.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(([System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment), $true))
$usage = [System.Security.Cryptography.OidCollection]::new()
$usage.Add([System.Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1')) | Out-Null
$serverRequest.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($usage, $true))
$san = [System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
$san.AddDnsName('localhost')
$san.AddDnsName([System.Net.Dns]::GetHostName())
$san.AddIpAddress([System.Net.IPAddress]::Loopback)
$san.AddIpAddress([System.Net.IPAddress]::IPv6Loopback)
foreach ($address in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces().GetIPProperties().UnicastAddresses.Address) {
  if ($address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork) { $san.AddIpAddress($address) }
}
$serverRequest.CertificateExtensions.Add($san.Build())
$serial = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(16)
$server = $serverRequest.Create($ca, $start, $end.AddDays(-1), $serial)
[System.IO.File]::WriteAllText((Join-Path $certDirectory 'ca.crt'), $ca.ExportCertificatePem())
[System.IO.File]::WriteAllText((Join-Path $certDirectory 'server.pem'), $server.ExportCertificatePem())
[System.IO.File]::WriteAllText((Join-Path $certDirectory 'server-key.pem'), $serverKey.ExportPkcs8PrivateKeyPem())
$ca.Dispose(); $caKey.Dispose(); $server.Dispose(); $serverKey.Dispose()
Write-Output "Certificates saved in $certDirectory"
Write-Output 'Manually trust ca.crt on the host and guest devices you own. Do not share server-key.pem.'
Write-Output 'Start HTTPS with: npm run oasis:lan -- --cert retrooasis/.lan-certs/server.pem --key retrooasis/.lan-certs/server-key.pem'
