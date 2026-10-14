from pathlib import Path
R=Path(__file__).resolve().parents[1]
def edit(path,a,b):
 p=R/path;s=p.read_text(encoding='utf-8');assert a in s,(path,a);p.write_text(s.replace(a,b),encoding='utf-8')
edit('services.js',"if(!run)throw Error('没有可结算的记录');", "if(!run)throw Error('没有可结算的记录');if(run.reward<=0)throw Error('本局未达到有效结算条件');")
edit('services.js','为矿工脚下添加青色灯环与十字光点','为矿工脚下添加青色灯环')
edit('services.js','挖掘落点绽放星辉','挖掘时矿工周围绽放星辉')
edit('services.js','随机矿洞 · 开始探索','随机矿洞 · 开始或继续')
edit('games/mine/src/modes/mining/MiningAdventure.js','  let panel;','  let panel, resumeAttempted=false;')
edit('games/mine/src/modes/mining/MiningAdventure.js',"if(!params.has('camp')||params.has('seed')||this.run.tutorialRun)return;", "if(resumeAttempted||!params.has('camp')||!params.has('start')||params.has('seed'))return;\n    resumeAttempted=true;if(this.run.tutorialRun)return;")
edit('games/mine/src/app.js','modal:s&&s.modal','modal:s&&s.modal,draft:r&&r.campDraft,runId:r&&r.campRunId')
edit('games/marble/state-endless.js','makeOffer(kind){const r=this.run','makeOffer(kind,reroll=false){const r=this.run')
edit('games/marble/state-endless.js',"if(kind!=='ad')r.selections++", "if(kind!=='ad'&&!reroll)r.selections++")
edit('games/marble/state-endless.js','this.makeOffer(kind);r.selections=selections','this.makeOffer(kind,true);r.selections=selections')
edit('games/marble/state-endless.js','offerType:r.offerType,help:', 'offerType:r.offerType,rerolled:!!r.rerolled,help:')
edit('tools/marble-endless-check.mjs','offerEffect} from','offerEffect,EVOLUTIONS} from')
edit('tools/marble-endless-check.mjs','for(const p of POWERS){const effects=', 'for(const p of POWERS.filter(p=>!EVOLUTIONS[p.id])){const effects=')
edit('games/coop/server/server.js','if (!fs.existsSync(WALLET_FILE) && fs.existsSync(LEGACY_WALLET_FILE))', 'if (!process.env.CAMP_COOP_DATA_DIR && !fs.existsSync(WALLET_FILE) && fs.existsSync(LEGACY_WALLET_FILE))')
edit('games/coop/server/server.js','if (fs.existsSync(LEGACY_WALLET_FILE)) fs.unlinkSync', 'if (!process.env.CAMP_COOP_DATA_DIR && fs.existsSync(LEGACY_WALLET_FILE)) fs.unlinkSync')
