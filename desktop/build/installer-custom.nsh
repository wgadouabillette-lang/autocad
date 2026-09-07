; Recreate desktop + Start Menu shortcuts with an explicit .ico (not exe,0).
; Windows caches .lnk icons by path — pointing at Meetra.ico avoids a stale exe icon cache.
; Also write both "all users" and "current user" desktop links for per-machine installs.
!macro customInstall
  ; --- All Users (perMachine) ---
  SetShellVarContext all
  Delete "$DESKTOP\Meetra.lnk"
  Delete "$DESKTOP\Hall.lnk"
  Delete "$SMPROGRAMS\Meetra.lnk"
  Delete "$SMPROGRAMS\Hall.lnk"
  ${If} ${FileExists} "$INSTDIR\Meetra.ico"
    CreateShortCut "$DESKTOP\Meetra.lnk" "$INSTDIR\Meetra.exe" "" "$INSTDIR\Meetra.ico" 0 "" "" "Meetra"
    CreateShortCut "$SMPROGRAMS\Meetra.lnk" "$INSTDIR\Meetra.exe" "" "$INSTDIR\Meetra.ico" 0 "" "" "Meetra"
  ${Else}
    CreateShortCut "$DESKTOP\Meetra.lnk" "$INSTDIR\Meetra.exe" "" "$INSTDIR\Meetra.exe" 0 "" "" "Meetra"
    CreateShortCut "$SMPROGRAMS\Meetra.lnk" "$INSTDIR\Meetra.exe" "" "$INSTDIR\Meetra.exe" 0 "" "" "Meetra"
  ${EndIf}

  ; --- Current user desktop (what Explorer often shows) ---
  SetShellVarContext current
  Delete "$DESKTOP\Meetra.lnk"
  Delete "$DESKTOP\Hall.lnk"
  ${If} ${FileExists} "$INSTDIR\Meetra.ico"
    CreateShortCut "$DESKTOP\Meetra.lnk" "$INSTDIR\Meetra.exe" "" "$INSTDIR\Meetra.ico" 0 "" "" "Meetra"
  ${Else}
    CreateShortCut "$DESKTOP\Meetra.lnk" "$INSTDIR\Meetra.exe" "" "$INSTDIR\Meetra.exe" 0 "" "" "Meetra"
  ${EndIf}

  SetShellVarContext all
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
