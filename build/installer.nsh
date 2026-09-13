; Image Forge — custom NSIS uninstall step.
; electron-builder injects this into the generated uninstaller via nsis.include.
;
; Uninstalling always removes the app, its shortcuts and its registry entries
; (electron-builder handles those). This adds ONE question: whether to also
; delete the settings, API keys and manifest.
;
; THE FOLDER NAME MATTERS. Electron keeps data under the package "name" from
; package.json — "image-forge" — because there is no "productName" there. This
; used to delete "$APPDATA\Image Forge", a folder that has never existed, so
; answering Yes deleted nothing while saying it had. Verified 13 September 2026
; against a real install: the data is in %APPDATA%\image-forge.
; tests/desktopApp.test.ts fails if this path and package.json ever disagree.
;
; /SD IDNO: a SILENT uninstall (uninstall.exe /S) answers No. Without it a
; scripted or automatic uninstall could take the default and wipe someone's
; keys without anyone ever seeing the question.

!macro customUnInstall
  SetShellVarContext current
  MessageBox MB_YESNO|MB_ICONQUESTION "Remove your Image Forge data as well?$\r$\n$\r$\nThis deletes your settings, API keys and manifest, stored in$\r$\n%APPDATA%\image-forge$\r$\n$\r$\nPictures you generated on disk are NOT touched.$\r$\n$\r$\nAnswer No to keep everything for a future reinstall." /SD IDNO IDNO keepForgeData
    RMDir /r "$APPDATA\image-forge"
  keepForgeData:
!macroend
