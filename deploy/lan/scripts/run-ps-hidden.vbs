' run-ps-hidden.vbs
' Launch a PowerShell .ps1 with ZERO visible console (WScript window style 0).
' Usage: wscript.exe //B //Nologo run-ps-hidden.vbs "C:\path\script.ps1" [wait]
'   wait = 1 (default) wait for exit; wait = 0 fire-and-forget (long-running)

If WScript.Arguments.Count < 1 Then
  WScript.Quit 1
End If

Dim scriptPath, waitFlag, cmd, sh, rc
scriptPath = WScript.Arguments(0)
waitFlag = True
If WScript.Arguments.Count >= 2 Then
  If WScript.Arguments(1) = "0" Then waitFlag = False
End If

cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & scriptPath & """"
Set sh = CreateObject("WScript.Shell")
rc = sh.Run(cmd, 0, waitFlag)
If waitFlag Then
  WScript.Quit rc
Else
  WScript.Quit 0
End If
