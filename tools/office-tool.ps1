$ErrorActionPreference = 'Stop'
$inputData = [Console]::In.ReadToEnd() | ConvertFrom-Json
if ($inputData.app -notin @('excel','word') -or $inputData.operation -notin @('read','write')) { throw 'Choose Excel/Word and read/write.' }
$path = [string]$inputData.path
if (-not [IO.Path]::IsPathRooted($path)) { throw 'Use an absolute local document path.' }
if ($inputData.operation -eq 'write' -and (Test-Path -LiteralPath $path) -and -not $inputData.overwrite) { throw 'File exists. Set overwrite explicitly to replace it.' }
$app = $null; $document = $null
try {
 if ($inputData.app -eq 'excel') {
  if ([IO.Path]::GetExtension($path) -ne '.xlsx') { throw 'Use an .xlsx file.' }
  $app = New-Object -ComObject Excel.Application
  $app.Visible = $false; $app.DisplayAlerts = $false; $app.AutomationSecurity = 3
  if ($inputData.operation -eq 'read') {
   $document = $app.Workbooks.Open($path,0,$true)
   $sheetName = if ($inputData.sheet) { $inputData.sheet } else { 1 }
   $sheet = $document.Worksheets.Item($sheetName)
   $rangeAddress = if ($inputData.range) { $inputData.range } else { 'A1:J20' }
   $range = $sheet.Range($rangeAddress)
   if ($range.Cells.Count -gt 2000) { throw 'Select at most 2,000 cells.' }
   $rows = @(); for($r=1;$r -le $range.Rows.Count;$r++) { $row=@();for($c=1;$c -le $range.Columns.Count;$c++){$row+= [string]$range.Cells.Item($r,$c).Text};$rows+=,@($row) }
   @{rows=$rows;rowCount=$rows.Count;path=$path;readOnly=$true} | ConvertTo-Json -Depth 12 -Compress
  } else {
   if (-not $inputData.values -or $inputData.values.Count -gt 200) { throw 'Provide 1–200 rows of values.' }
   $document = $app.Workbooks.Add(); $sheet=$document.Worksheets.Item(1)
   $r=1;foreach($row in $inputData.values){if($row.Count -gt 50){throw 'Maximum 50 columns.'};$c=1;foreach($value in $row){$sheet.Cells.Item($r,$c).NumberFormat='@';$sheet.Cells.Item($r,$c).Value2=[string]$value;$c++};$r++}
   $document.SaveAs($path,51);@{path=$path;rowCount=$inputData.values.Count;confirmed=$true}|ConvertTo-Json -Compress
  }
 } else {
  if ([IO.Path]::GetExtension($path) -ne '.docx') { throw 'Use a .docx file.' }
  $app=New-Object -ComObject Word.Application;$app.Visible=$false;$app.DisplayAlerts=0;$app.AutomationSecurity=3
  if($inputData.operation -eq 'read'){$document=$app.Documents.Open($path,$false,$true);$text=[string]$document.Content.Text;if($text.Length -gt 150000){throw 'Document exceeds text limit.'};@{path=$path;text=$text;readOnly=$true}|ConvertTo-Json -Compress}
  else {if(([string]$inputData.text).Length -gt 150000){throw 'Document text too long.'};$document=$app.Documents.Add();$document.Content.Text=[string]$inputData.text;$document.SaveAs2($path,16);@{path=$path;confirmed=$true}|ConvertTo-Json -Compress}
 }
} finally {
 if($document){$document.Close(0);[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document)}
 if($app){$app.Quit();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($app)}
 [GC]::Collect();[GC]::WaitForPendingFinalizers()
}
