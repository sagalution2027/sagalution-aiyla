; Aiyla Command Centre — Windows 11 ARM64 installer
; This installer intentionally embeds and extracts only APP_ARM64.
; It does not use the Electron Builder universal-architecture selector because
; that selector can leave an empty directory when its ARM detection is emulated.

!include "MUI2.nsh"

Unicode true
RequestExecutionLevel user
Name "${PRODUCT_NAME}"
InstallDir "$LOCALAPPDATA\Programs\${APP_FILENAME}"

Var startMenuShortcut
Var desktopShortcut

!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro addLangs

!macro extractEmbeddedArm64Payload
  nsisunz::Unzip "$PLUGINSDIR\app-arm64.zip" "$INSTDIR"
  Pop $0
  StrCmp $0 "success" +4
    MessageBox MB_ICONSTOP|MB_OK "Aiyla Command Centre could not extract its ARM64 application files. Setup has not completed."
    SetErrorLevel 1
    Abort
!macroend

Section "Install Aiyla Command Centre" SEC_INSTALL
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  InitPluginsDir

  ; Extract directly to the selected installation folder. This intentionally
  ; avoids the default architecture selector, which can yield no payload on WoA.
  File /oname=$PLUGINSDIR\app-arm64.zip "${APP_ARM64}"
  !insertmacro extractEmbeddedArm64Payload

  IfFileExists "$INSTDIR\Aiyla Command Centre.exe" +2 0
    Goto extractionMissing

  WriteUninstaller "$INSTDIR\Uninstall Aiyla Command Centre.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AiylaCommandCentre" "DisplayName" "${UNINSTALL_DISPLAY_NAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AiylaCommandCentre" "DisplayIcon" "$INSTDIR\Aiyla Command Centre.exe,0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AiylaCommandCentre" "UninstallString" '"$INSTDIR\Uninstall Aiyla Command Centre.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AiylaCommandCentre" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AiylaCommandCentre" "NoRepair" 1

  StrCpy $desktopShortcut "$DESKTOP\Aiyla Command Centre.lnk"
  StrCpy $startMenuShortcut "$SMPROGRAMS\Aiyla Command Centre.lnk"
  Delete "$desktopShortcut"
  Delete "$startMenuShortcut"
  CreateShortCut "$desktopShortcut" "$INSTDIR\Aiyla Command Centre.exe" "" "$INSTDIR\Aiyla Command Centre.exe" 0
  CreateShortCut "$startMenuShortcut" "$INSTDIR\Aiyla Command Centre.exe" "" "$INSTDIR\Aiyla Command Centre.exe" 0
  CreateShortCut "$SMPROGRAMS\Uninstall Aiyla Command Centre.lnk" "$INSTDIR\Uninstall Aiyla Command Centre.exe"
  Goto installComplete

  extractionMissing:
    MessageBox MB_ICONSTOP|MB_OK "Aiyla Command Centre could not extract its ARM64 application files. Setup has not completed."
    SetErrorLevel 1
    Abort

  installComplete:
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\Aiyla Command Centre.lnk"
  Delete "$SMPROGRAMS\Aiyla Command Centre.lnk"
  Delete "$SMPROGRAMS\Uninstall Aiyla Command Centre.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AiylaCommandCentre"
  RMDir /r "$INSTDIR"
SectionEnd
