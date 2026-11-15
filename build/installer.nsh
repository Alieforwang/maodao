; Close the tray app before copying files. 1.0.1–1.0.3 used the Chinese
; product name as the exe (码到.exe). 1.0.4 uses MaoDao.exe. Either one
; may still be running, and tasklist often misses the Chinese image name.
!macro customCheckAppRunning
  DetailPrint "Closing MaoDao before installing..."
  nsExec::Exec `"$SYSDIR\taskkill.exe" /F /T /IM "MaoDao.exe"`
  Pop $0
  nsExec::Exec `"$SYSDIR\taskkill.exe" /F /T /IM "码到.exe"`
  Pop $0
  Sleep 800
  nsExec::Exec `"$SYSDIR\taskkill.exe" /F /T /IM "MaoDao.exe"`
  Pop $0
  nsExec::Exec `"$SYSDIR\taskkill.exe" /F /T /IM "码到.exe"`
  Pop $0
  Sleep 500
!macroend
