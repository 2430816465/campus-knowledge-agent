extends SceneTree
## Executes real isolated native module tests, retaining child exit codes and logs.
## Formal visual audit rounds are independent and are never manufactured here.
func _initialize() -> void:
 var started := Time.get_ticks_msec()
 var results: Array = []
 var failures := 0
 var report_dir := "user://test-runs/%s-%s" % [int(Time.get_unix_time_from_system()),OS.get_process_id()]
 DirAccess.make_dir_recursive_absolute(report_dir)
 var files: Array = []
 for name in DirAccess.get_files_at("res://tests"):
  if name.begins_with("test_") and name.ends_with(".gd"): files.append(name)
 files.sort()
 for file in files:
  var output: Array = []
  var before := Time.get_ticks_msec()
  var code := OS.execute(OS.get_executable_path(),["--headless","--path",ProjectSettings.globalize_path("res://"),"--script","res://tests/"+file],output,true)
  var log_text := "\n".join(output)
  var passed := code==0 and not log_text.contains("SCRIPT ERROR:") and not log_text.contains("\nERROR:")
  if not passed: failures+=1
  var log_path := report_dir.path_join(file+".log")
  var log_file := FileAccess.open(log_path,FileAccess.WRITE)
  if log_file != null: log_file.store_string(log_text);log_file.close()
  results.append({"file":"tests/"+file,"passed":passed,"exit_code":code,"milliseconds":Time.get_ticks_msec()-before,"log":ProjectSettings.globalize_path(log_path)})
  print(("PASS " if passed else "FAIL ")+file+" "+str(Time.get_ticks_msec()-before)+"ms")
  if not passed: print(log_text)
 var report := {"utc":Time.get_datetime_string_from_system(true),"engine":Engine.get_version_info().string,"scope":"Native module suite; not the four full product audits","results":results,"failed_suites":failures,"milliseconds":Time.get_ticks_msec()-started}
 var result_file := FileAccess.open(report_dir.path_join("results.json"),FileAccess.WRITE)
 if result_file!=null: result_file.store_string(JSON.stringify(report,"  "));result_file.close()
 print("NATIVE SUITES: ",results.size()," executed, ",failures," failed. Report: ",ProjectSettings.globalize_path(report_dir))
 quit(0 if failures==0 and not results.is_empty() else 1)
