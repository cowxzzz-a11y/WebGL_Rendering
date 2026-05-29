Option Explicit

Dim fso, shell, baseDir, htmlPath
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
htmlPath = fso.BuildPath(baseDir, "index.html")

If fso.FileExists(htmlPath) Then
  shell.Run """" & htmlPath & """", 1, False
Else
  MsgBox "Cannot find index.html next to this launcher.", vbExclamation, "Sheet Packer"
End If
