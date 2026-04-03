Option Explicit

Dim fso, shell, scriptDir, ps1Path, commandText, i

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1Path = fso.BuildPath(scriptDir, "optimize-glb-ui.ps1")

commandText = "powershell.exe -NoProfile -NoLogo -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File " & QuoteArg(ps1Path)

For i = 0 To WScript.Arguments.Count - 1
    commandText = commandText & " " & QuoteArg(WScript.Arguments.Item(i))
Next

shell.Run commandText, 0, False

Function QuoteArg(ByVal value)
    QuoteArg = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function
