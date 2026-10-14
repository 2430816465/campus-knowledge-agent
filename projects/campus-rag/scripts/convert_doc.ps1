param([Parameter(Mandatory=$true)][string]$InputFile,[Parameter(Mandatory=$true)][string]$OutputFile)
$ErrorActionPreference='Stop'
$conversionStage='resolve'
try {
$inputAbsolute=(Resolve-Path -LiteralPath $InputFile).Path
$outputAbsolute=[IO.Path]::GetFullPath($OutputFile)
if (Test-Path -LiteralPath $outputAbsolute) { throw 'Destination exists; refusing overwrite.' }
$word=$null;$document=$null;$saveChanges=0
try {
    $conversionStage='create'
    $word=New-Object -ComObject Word.Application
    $word.Visible=$false
    $word.DisplayAlerts=0
    $word.AutomationSecurity=3
    $conversionStage='open'
    $document=$word.Documents.Open($inputAbsolute,$false,$true,$false)
    $conversionStage='save'
    $document.SaveAs2($outputAbsolute,16)
    # Word's COM signatures use reference arguments, including SaveChanges.
    $conversionStage='close'
    $document.Close([ref]$saveChanges)
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document)
    $document=$null
} finally {
    if ($document) {
        try { $document.Close([ref]$saveChanges) }
        catch { $conversionStage='close'; throw }
        finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) }
    }
    if ($word) {
        try { $word.Quit([ref]$saveChanges) }
        catch { $conversionStage='quit'; throw }
        finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) }
    }
}
} catch {
    # Persist only bounded non-secret codes. Never print Office error messages,
    # source paths, document text or credentials into the collection log.
    $code=([long]$_.Exception.HResult -band 0xffffffffL).ToString('X8')
    [Console]::Error.WriteLine("CAMPUS_WORD_ERROR|stage=$conversionStage|hresult=0x$code")
    exit 1
}
Write-Output 'Local Word conversion complete; macros disabled; source opened read-only.'
