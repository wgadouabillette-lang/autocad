; One desktop shortcut only.
; A per-machine install already creates the public desktop link. Creating a second
; link on the current user's desktop makes Windows show two Meetra icons.
; Recreate the public shortcut with Meetra.ico so the icon cache stays correct.
!macro customInstall
  SetShellVarContext current
  Delete "$DESKTOP\Meetra.lnk"
  Delete "$DESKTOP\Hall.lnk"
  Delete "$SMPROGRAMS\Meetra.lnk"
  Delete "$SMPROGRAMS\Hall.lnk"

  SetShellVarContext all
  Delete "$DESKTOP\Hall.lnk"
  Delete "$SMPROGRAMS\Hall.lnk"
  Delete "$DESKTOP\Meetra.lnk"
  Delete "$SMPROGRAMS\Meetra.lnk"
  ${If} ${FileExists} "$INSTDIR\Meetra.ico"
    CreateShortCut "$DESKTOP\Meetra.lnk" "$INSTDIR\Meetra.exe" "" "$INSTDIR\Meetra.ico" 0 "" "" "Meetra"
    CreateShortCut "$SMPROGRAMS\Meetra.lnk" "$INSTDIR\Meetra.exe" "" "$INSTDIR\Meetra.ico" 0 "" "" "Meetra"
  ${Else}
    CreateShortCut "$DESKTOP\Meetra.lnk" "$INSTDIR\Meetra.exe" "" "$INSTDIR\Meetra.exe" 0 "" "" "Meetra"
    CreateShortCut "$SMPROGRAMS\Meetra.lnk" "$INSTDIR\Meetra.exe" "" "$INSTDIR\Meetra.exe" 0 "" "" "Meetra"
  ${EndIf}

  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  SetShellVarContext current
  Delete "$DESKTOP\Meetra.lnk"
  Delete "$DESKTOP\Hall.lnk"
  Delete "$SMPROGRAMS\Meetra.lnk"
  Delete "$SMPROGRAMS\Hall.lnk"
  SetShellVarContext all
  Delete "$DESKTOP\Meetra.lnk"
  Delete "$DESKTOP\Hall.lnk"
  Delete "$SMPROGRAMS\Meetra.lnk"
  Delete "$SMPROGRAMS\Hall.lnk"
!macroend
