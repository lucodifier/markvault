!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\Directory\shell\MarkVault" "" "Abrir essa pasta no MarkVault"
  WriteRegStr SHCTX "Software\Classes\Directory\shell\MarkVault" "Icon" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr SHCTX "Software\Classes\Directory\shell\MarkVault\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\MarkVault" "" "Abrir essa pasta no MarkVault"
  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\MarkVault" "Icon" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\MarkVault\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%V"'

  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey SHCTX "Software\Classes\Directory\shell\MarkVault"
  DeleteRegKey SHCTX "Software\Classes\Directory\Background\shell\MarkVault"

  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
