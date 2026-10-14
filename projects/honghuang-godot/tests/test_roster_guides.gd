extends SceneTree
func _initialize() -> void:
 var errors: Array = []
 var checks := 0
 for hero in GameData.content("CHARACTERS"):
  var guide: Dictionary = GameData.content("CHARACTER_GUIDES").get(hero.id,{})
  for key in ["role","tip","route"]:
   checks += 1
   if str(guide.get(key,"")).is_empty(): errors.append(hero.id+" missing "+key)
  for key in ["partners","substitutes"]:
   checks += 1
   if guide.get(key,[]).is_empty(): errors.append(hero.id+" empty "+key)
   for partner in guide.get(key,[]):
    checks += 1
    if partner==hero.id or GameData.character(partner).is_empty(): errors.append(hero.id+" invalid guide "+str(partner))
 print("ROSTER GUIDES: ",checks," checks, ",errors.size()," failures")
 for error in errors: push_error(error)
 quit(0 if errors.is_empty() else 1)
