Option Explicit

Dim fso, shell, scriptDir, ps1Path, command, inputPath
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1Path = fso.BuildPath(scriptDir, "GLB-Optimizer-UI.ps1")
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -STA -File " & Chr(34) & ps1Path & Chr(34)

If WScript.Arguments.Count > 0 Then
    inputPath = WScript.Arguments(0)
    command = command & " " & Chr(34) & inputPath & Chr(34)
End If

shell.Run command, 0, False
