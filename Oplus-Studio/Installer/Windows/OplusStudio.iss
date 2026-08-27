#define AppName "Otiner Studio"
#define AppPublisher "Otiner Studio"
#define AppVersion GetEnv("OPLUS_INSTALLER_VERSION")
#if AppVersion == ""
  #define AppVersion "1.4.0"
#endif
#define ProjectRoot SourcePath + "..\.."
#define PayloadRoot ProjectRoot + "\dist\studio.oplus.ae"

[Setup]
AppId={{8C7B5652-B19D-4873-AB69-2A1BCF0729D1}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={userappdata}\Adobe\CEP\extensions\studio.oplus.ae
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
OutputDir={#ProjectRoot}\release
OutputBaseFilename=Otiner-Studio-Setup-Windows-{#AppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
CloseApplications=no
RestartApplications=no
SetupLogging=yes
UninstallDisplayName=Otiner Studio (Development Installer)
VersionInfoVersion={#AppVersion}
VersionInfoDescription=Otiner Studio installer for Adobe After Effects 2025
VersionInfoProductName=Otiner Studio
VersionInfoProductVersion={#AppVersion}
InfoBeforeFile=before-install.txt
InfoAfterFile=after-install.txt

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#PayloadRoot}\*"; DestDir: "{app}"; Excludes: "Database\*"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#PayloadRoot}\Database\*"; DestDir: "{app}\Database"; Flags: ignoreversion recursesubdirs createallsubdirs onlyifdoesntexist uninsneveruninstall

[Registry]
Root: HKCU; Subkey: "Software\Adobe\CSXS.12"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
